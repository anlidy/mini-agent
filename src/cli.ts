#!/usr/bin/env node
import { stat } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import readline from "node:readline/promises";
import { stdin, stdout } from "node:process";
import type { Readable, Writable } from "node:stream";

import { AgentLoop } from "./agent/AgentLoop.js";
import { ensureDefaultConfig } from "./config/loadConfig.js";
import { ConfigValidationError } from "./config/schema.js";
import { createProvider } from "./providers/factory.js";
import { SessionManager } from "./session/SessionManager.js";
import { createDefaultToolRegistry } from "./tools/index.js";
import type { ToolRegistry } from "./tools/ToolRegistry.js";
import { RuntimePaths } from "./runtime/paths.js";
import { importLegacyWorkspace } from "./runtime/importLegacy.js";
import { DirectAgentClient } from "./client/DirectAgentClient.js";

interface CliArgs {
  command: "run" | "import";
  workspace: string;
  session: string;
  resume: boolean;
  stream: boolean;
  apply: boolean;
}

export interface RunCliOptions {
  argv?: string[];
  input?: NodeJS.ReadableStream;
  output?: NodeJS.WritableStream;
  runtimeHome?: string;
}

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
  const args = parseCliArgs(options.argv ?? process.argv.slice(2));
  const requestedPaths = new RuntimePaths({ home: options.runtimeHome, workspace: args.workspace });
  const workspace = await requestedPaths.normalizeWorkspace(args.workspace);
  const paths = new RuntimePaths({ home: requestedPaths.home, workspace });

  if (args.command === "import") {
    const report = await importLegacyWorkspace(paths, args.apply);
    await writeOutput(output, `${args.apply ? "Import applied" : "Import dry-run"}: ${JSON.stringify(report, null, 2)}\n`);
    return;
  }

  const configDir = paths.home;
  let config;
  try {
    config = await ensureDefaultConfig(configDir);
  } catch (error) {
    if (error instanceof ConfigValidationError) {
      await writeOutput(output, `Config error: ${error.message}\nFix ${paths.configFile} and retry.\n`);
      process.exitCode = 1;
      return;
    }
    throw error;
  }

  const agentKey = "default";
  const agentConfig = config.agents[agentKey];
  if (!agentConfig) {
    await writeOutput(output, `Error: no "${agentKey}" agent configured.\n`);
    process.exitCode = 1;
    return;
  }

  const providerName = agentConfig.provider;
  const providerConfig = config.providers[providerName];
  const sessionManager = new SessionManager({ sessionsDir: paths.sessionsDir, source: "cli" });
  const registry = createDefaultToolRegistry({ search: config.tools.search, exec: config.tools.exec });
  const agent = new AgentLoop({
    workspace,
    runtimeHome: paths.home,
    config,
    agentKey,
    sessionKey: args.session,
    sessionSource: "cli",
    tools: registry,
    sessions: sessionManager
  });
  const client = new DirectAgentClient({ agent, sessions: sessionManager, tools: registry, workspace, runtimeHome: paths.home });
  await maybeWriteImportHint(paths, output);
  const session = await client.getSession(args.session) ?? await client.createSession({ key: args.session, workspace });

  await writeOutput(output, `mini-agent agent=${agentKey} provider=${providerName}(${providerConfig?.type ?? "?"}) model=${agentConfig.model} session=${args.session}\n`);
  await writeOutput(output, "Type /help for commands.\n");
  if (args.resume) {
    await writeOutput(output, `Resumed session ${args.session}\n`);
    for (const message of session.messages) {
      if (message.role === "user" || message.role === "assistant") {
        await writeOutput(output, `${message.role}> ${String(message.content)}\n`);
      }
    }
  }

  const ctx: ReplContext = {
    agent,
    registry,
    workspace,
    sessionKey: args.session,
    output,
    stream: args.stream
  };

  const rl = readline.createInterface({ input: input as Readable, output: output as Writable });
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

const HELP_TEXT = [
  "Commands:",
  "  /help                 Show this help",
  "  /tools                List registered tools",
  "  /tool <name> <json>   Run a tool directly (e.g. /tool apply_patch {\"patch\":\"...\"})",
  "  /exit, /quit          Leave the REPL",
  "Anything else is sent to the agent. Ctrl-C interrupts the current turn.",
  "Run with --stream to see tokens live."
].join("\n");

async function handleLine(line: string, ctx: ReplContext): Promise<boolean> {
  const text = line.trim();
  if (!text) return false;
  if (text === "/exit" || text === "/quit") return true;
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
  } catch (error) {
    await writeOutput(ctx.output, `error> ${error instanceof Error ? error.message : String(error)}\n`);
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
      } else if (event.type === "thinking") {
        await writeOutput(ctx.output, `\n[thinking] ${event.text}\n`);
      } else if (event.type === "tool_call") {
        toolsUsed.push(event.name);
      } else if (event.type === "done") {
        usage = event.result.usage;
      } else if (event.type === "error") {
        await writeOutput(ctx.output, `\nerror> ${event.error}\n`);
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
  if (entries.length === 0) return "";
  return entries.map(([key, value]) => `${key}=${value}`).join(" ");
}

function parseCliArgs(argv: string[]): CliArgs {
  const command = argv[0] === "import" ? "import" : "run";
  const args = command === "import" ? argv.slice(1) : argv;
  const { values } = parseArgs({
    args,
    options: {
      workspace: { type: "string", default: process.cwd() },
      session: { type: "string", default: "default" },
      resume: { type: "boolean", default: false },
      stream: { type: "boolean", default: false },
      apply: { type: "boolean", default: false }
    },
    strict: true,
    allowPositionals: false
  });
  return {
    command,
    workspace: values.workspace ?? process.cwd(),
    session: values.session ?? "default",
    resume: values.resume ?? false,
    stream: values.stream ?? false,
    apply: values.apply ?? false
  };
}

async function maybeWriteImportHint(paths: RuntimePaths, output: NodeJS.WritableStream): Promise<void> {
  if (paths.legacyHome() === paths.home) return;
  const exists = await stat(paths.legacyHome()).then((info) => info.isDirectory()).catch(() => false);
  if (exists) {
    await writeOutput(output, `Legacy runtime data found at ${paths.legacyHome()}. Run mini-agent import --workspace ${paths.projectWorkspace} to preview an explicit import.\n`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}

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
