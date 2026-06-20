#!/usr/bin/env node
import readline from "node:readline/promises";
import { stdin, stdout } from "node:process";
import type { Readable, Writable } from "node:stream";

import { AgentLoop } from "./agent/AgentLoop.js";
import { ensureDefaultConfig } from "./config/loadConfig.js";
import { OpenAIProvider } from "./providers/OpenAIProvider.js";
import { SessionManager } from "./session/SessionManager.js";
import { createDefaultToolRegistry } from "./tools/index.js";

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

export async function runCli(options: RunCliOptions = {}): Promise<void> {
  const input = options.input ?? stdin;
  const output = options.output ?? stdout;
  const args = parseArgs(options.argv ?? process.argv.slice(2));
  const config = await ensureDefaultConfig(args.workspace);
  const sessionManager = new SessionManager({ workspace: config.workspace, sessionsDir: config.sessions.dir });
  const session = await sessionManager.getOrCreate(args.session);

  await writeOutput(output, `mini-agent (${config.provider.name ?? "provider"}:${config.provider.model ?? "model"}) session=${args.session}\n`);
  if (args.resume) {
    await writeOutput(output, `Resumed session ${args.session}\n`);
    for (const message of session.messages) {
      if (message.role === "user" || message.role === "assistant") {
        await writeOutput(output, `${message.role}> ${String(message.content)}\n`);
      }
    }
  }

  const agent = new AgentLoop({
    workspace: config.workspace,
    sessionKey: args.session,
    sessionsDir: config.sessions.dir,
    model: config.provider.model,
    maxIterations: config.agent.maxIterations,
    maxToolResultChars: config.agent.maxToolResultChars,
    tools: createDefaultToolRegistry({ search: config.search }),
    provider: new OpenAIProvider({
      apiKey: config.provider.apiKey ?? "",
      baseUrl: config.provider.baseUrl,
      model: config.provider.model ?? "deepseek-chat",
      timeoutMs: config.provider.timeoutMs
    })
  });

  const rl = readline.createInterface({ input: input as Readable, output: output as Writable });
  try {
    if (isTty(input)) {
      while (true) {
        const line = await rl.question("> ");
        if (await handleLine(line, agent, args.session, output, args.stream)) {
          break;
        }
      }
    } else {
      await writeOutput(output, "> ");
      for await (const line of rl) {
        if (await handleLine(String(line), agent, args.session, output, args.stream)) {
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

async function handleLine(
  line: string,
  agent: AgentLoop,
  sessionKey: string,
  output: NodeJS.WritableStream,
  stream: boolean
): Promise<boolean> {
  const text = line.trim();
  if (!text || text === "/exit" || text === "/quit") {
    return true;
  }
  if (stream) {
    return handleStreamingLine(text, agent, sessionKey, output);
  }
  const result = await agent.run(text, { sessionKey });
  await writeOutput(output, `assistant> ${result.content}\n`);
  if (result.toolsUsed.length > 0) {
    await writeOutput(output, `tools> ${result.toolsUsed.join(", ")}\n`);
  }
  const usageLine = formatUsage(result.usage);
  if (usageLine) {
    await writeOutput(output, `usage> ${usageLine}\n`);
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

async function handleStreamingLine(
  text: string,
  agent: AgentLoop,
  sessionKey: string,
  output: NodeJS.WritableStream
): Promise<boolean> {
  await writeOutput(output, "assistant> ");
  const toolsUsed: string[] = [];
  let usage: Record<string, number> = {};
  for await (const event of agent.stream(text, { sessionKey })) {
    if (event.type === "token") {
      await writeOutput(output, event.text);
    } else if (event.type === "tool_call") {
      toolsUsed.push(event.name);
    } else if (event.type === "done") {
      usage = event.result.usage;
    }
  }
  await writeOutput(output, "\n");
  if (toolsUsed.length > 0) {
    await writeOutput(output, `tools> ${toolsUsed.join(", ")}\n`);
  }
  const usageLine = formatUsage(usage);
  if (usageLine) {
    await writeOutput(output, `usage> ${usageLine}\n`);
  }
  return false;
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
