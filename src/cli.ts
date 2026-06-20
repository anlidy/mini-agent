#!/usr/bin/env node
import readline from "node:readline/promises";
import { stdin, stdout } from "node:process";
import type { Readable, Writable } from "node:stream";

import { AgentLoop } from "./agent/AgentLoop.js";
import { ensureDefaultConfig } from "./config/loadConfig.js";
import { ConfigValidationError } from "./config/schema.js";
import { OpenAIProvider } from "./providers/OpenAIProvider.js";
import { SessionManager } from "./session/SessionManager.js";
import { createDefaultToolRegistry } from "./tools/index.js";
import type { ToolRegistry } from "./tools/ToolRegistry.js";

interface CliArgs {
  workspace: string;
  session: string;
  resume: boolean;
  stream: boolean;
}

export interface RunCliOptions {
  argv?: string[];
  input?: NodeJS.ReadableStream;
  output?: NodeJS.WritableStream;
}

/** Mutable per-session REPL state shared by the loop, commands, and SIGINT. */
interface ReplContext {
  agent: AgentLoop;
  registry: ToolRegistry;
  workspace: string;
  sessionKey: string;
  output: NodeJS.WritableStream;
  stream: boolean;
  abort?: AbortController;
}

export async function runCli(options: RunCliOptions = {}): Promise<void> {
  const input = options.input ?? stdin;
  const output = options.output ?? stdout;
  const args = parseArgs(options.argv ?? process.argv.slice(2));

  let config;
  try {
    config = await ensureDefaultConfig(args.workspace);
  } catch (error) {
    if (error instanceof ConfigValidationError) {
      await writeOutput(output, `Config error: ${error.message}\nFix .mini-agent/config.json and retry.\n`);
      process.exitCode = 1;
      return;
    }
    throw error;
  }
  // CLI-SETUP-MARKER
  const sessionManager = new SessionManager({ workspace: config.workspace, sessionsDir: config.sessions.dir });
  const session = await sessionManager.getOrCreate(args.session);

  await writeOutput(output, `mini-agent (${config.provider.name ?? "provider"}:${config.provider.model ?? "model"}) session=${args.session}\n`);
  await writeOutput(output, "Type /help for commands.\n");
  if (args.resume) {
    await writeOutput(output, `Resumed session ${args.session}\n`);
    for (const message of session.messages) {
      if (message.role === "user" || message.role === "assistant") {
        await writeOutput(output, `${message.role}> ${String(message.content)}\n`);
      }
    }
  }

  const registry = createDefaultToolRegistry({ search: config.search, exec: config.exec });
  const agent = new AgentLoop({
    workspace: config.workspace,
    sessionKey: args.session,
    sessionsDir: config.sessions.dir,
    model: config.provider.model,
    maxIterations: config.agent.maxIterations,
    maxToolResultChars: config.agent.maxToolResultChars,
    tools: registry,
    provider: new OpenAIProvider({
      apiKey: config.provider.apiKey ?? "",
      baseUrl: config.provider.baseUrl,
      model: config.provider.model ?? "deepseek-chat",
      timeoutMs: config.provider.timeoutMs
    })
  });

  const ctx: ReplContext = {
    agent,
    registry,
    workspace: config.workspace,
    sessionKey: args.session,
    output,
    stream: args.stream
  };

  const rl = readline.createInterface({ input: input as Readable, output: output as Writable });
  // Ctrl-C aborts the in-flight turn if one is running; otherwise it exits.
  rl.on("SIGINT", () => {
    if (ctx.abort && !ctx.abort.signal.aborted) {
      ctx.abort.abort();
      output.write("\n[interrupting current turn — Ctrl-C again to exit]\n");
    } else {
      rl.close();
    }
  });

  try {
    if (isTty(input)) {
      while (true) {
        const line = await rl.question("> ");
        if (await handleLine(line, ctx)) {
          break;
        }
      }
    } else {
      await writeOutput(output, "> ");
      for await (const line of rl) {
        if (await handleLine(String(line), ctx)) {
          break;
        }
        await writeOutput(output, "> ");
      }
    }
  } finally {
    rl.close();
    await flushStdout(output);
  }
}
// CLI-BODY-MARKER

const HELP_TEXT = [
  "Commands:",
  "  /help                 Show this help",
  "  /tools                List registered tools",
  "  /tool <name> <json>   Run a tool directly (e.g. /tool apply_patch {\"patch\":\"...\"})",
  "  /exit, /quit          Leave the REPL",
  "Anything else is sent to the agent. Ctrl-C interrupts the current turn.",
  "Run with --stream to see tokens live."
].join("\n");

/** Returns true when the REPL should stop. */
async function handleLine(line: string, ctx: ReplContext): Promise<boolean> {
  const text = line.trim();
  if (!text) {
    return false;
  }
  if (text === "/exit" || text === "/quit") {
    return true;
  }
  if (text === "/help") {
    await writeOutput(ctx.output, `${HELP_TEXT}\n`);
    return false;
  }
  if (text === "/tools") {
    await handleToolsCommand(ctx);
    return false;
  }
  if (text === "/tool" || text.startsWith("/tool ")) {
    await handleToolCommand(text.slice("/tool".length).trim(), ctx);
    return false;
  }
  if (text.startsWith("/")) {
    await writeOutput(ctx.output, `Unknown command: ${text}. Type /help.\n`);
    return false;
  }
  return ctx.stream ? handleStreamingLine(text, ctx) : handleRunLine(text, ctx);
}

async function handleToolsCommand(ctx: ReplContext): Promise<void> {
  const definitions = ctx.registry.getDefinitions();
  const lines = definitions.map((definition) => {
    const fn = definition.function as { name?: string; description?: string } | undefined;
    return `  ${fn?.name ?? "?"} — ${fn?.description ?? ""}`;
  });
  await writeOutput(ctx.output, `Registered tools (${definitions.length}):\n${lines.join("\n")}\n`);
}

async function handleToolCommand(rest: string, ctx: ReplContext): Promise<void> {
  const space = rest.indexOf(" ");
  const name = space === -1 ? rest : rest.slice(0, space);
  const argText = space === -1 ? "" : rest.slice(space + 1).trim();
  if (!name) {
    await writeOutput(ctx.output, "Usage: /tool <name> <json-args>\n");
    return;
  }
  let args: Record<string, unknown> = {};
  if (argText) {
    try {
      const parsed = JSON.parse(argText) as unknown;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        await writeOutput(ctx.output, "Error: tool args must be a JSON object.\n");
        return;
      }
      args = parsed as Record<string, unknown>;
    } catch (error) {
      await writeOutput(ctx.output, `Error: invalid JSON args: ${error instanceof Error ? error.message : String(error)}\n`);
      return;
    }
  }
  const result = await ctx.registry.execute(name, args, { workspace: ctx.workspace });
  await writeOutput(ctx.output, `${typeof result === "string" ? result : JSON.stringify(result)}\n`);
}
// CLI-HANDLERS-MARKER

async function handleRunLine(text: string, ctx: ReplContext): Promise<boolean> {
  ctx.abort = new AbortController();
  try {
    const result = await ctx.agent.run(text, { sessionKey: ctx.sessionKey, signal: ctx.abort.signal });
    await writeOutput(ctx.output, `assistant> ${result.content}\n`);
    if (result.toolsUsed.length > 0) {
      await writeOutput(ctx.output, `tools> ${result.toolsUsed.join(", ")}\n`);
    }
    const usageLine = formatUsage(result.usage);
    if (usageLine) {
      await writeOutput(ctx.output, `usage> ${usageLine}\n`);
    }
  } finally {
    ctx.abort = undefined;
  }
  return false;
}

async function handleStreamingLine(text: string, ctx: ReplContext): Promise<boolean> {
  ctx.abort = new AbortController();
  await writeOutput(ctx.output, "assistant> ");
  const toolsUsed: string[] = [];
  let usage: Record<string, number> = {};
  try {
    for await (const event of ctx.agent.stream(text, { sessionKey: ctx.sessionKey, signal: ctx.abort.signal })) {
      if (event.type === "token") {
        await writeOutput(ctx.output, event.text);
      } else if (event.type === "tool_call") {
        toolsUsed.push(event.name);
      } else if (event.type === "done") {
        usage = event.result.usage;
      }
    }
  } finally {
    ctx.abort = undefined;
  }
  await writeOutput(ctx.output, "\n");
  if (toolsUsed.length > 0) {
    await writeOutput(ctx.output, `tools> ${toolsUsed.join(", ")}\n`);
  }
  const usageLine = formatUsage(usage);
  if (usageLine) {
    await writeOutput(ctx.output, `usage> ${usageLine}\n`);
  }
  return false;
}

function formatUsage(usage: Record<string, number>): string {
  const entries = Object.entries(usage).filter(([, value]) => Number.isFinite(value) && value > 0);
  if (entries.length === 0) {
    return "";
  }
  return entries.map(([key, value]) => `${key}=${value}`).join(" ");
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    workspace: process.cwd(),
    session: "default",
    resume: false,
    stream: false
  };
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (item === "--workspace" && argv[index + 1]) {
      args.workspace = argv[index + 1] ?? args.workspace;
      index += 1;
    } else if (item === "--session" && argv[index + 1]) {
      args.session = argv[index + 1] ?? args.session;
      index += 1;
    } else if (item === "--resume") {
      args.resume = true;
    } else if (item === "--stream") {
      args.stream = true;
    }
  }
  return args;
}

runCli().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});

async function flushStdout(output: NodeJS.WritableStream): Promise<void> {
  if (hasWritableNeedDrain(output) && output.writableNeedDrain) {
    await new Promise<void>((resolve) => output.once("drain", resolve));
  }
}

async function writeOutput(output: NodeJS.WritableStream, text: string): Promise<void> {
  if (!output.write(text)) {
    await new Promise<void>((resolve) => output.once("drain", resolve));
  }
}

function hasWritableNeedDrain(output: NodeJS.WritableStream): output is NodeJS.WritableStream & { writableNeedDrain: boolean } {
  return "writableNeedDrain" in output;
}

function isTty(input: NodeJS.ReadableStream): boolean {
  return "isTTY" in input && input.isTTY === true;
}


