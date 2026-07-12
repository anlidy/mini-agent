import path from "node:path";

import { ContextBuilder } from "./ContextBuilder.js";
import { AgentRunner, type AgentRunSpec, type AgentRunResult } from "./AgentRunner.js";
import type { Config } from "../config/Config.js";
import { ensureDefaultConfig } from "../config/loadConfig.js";
import { createProvider } from "../providers/factory.js";
import { SessionManager } from "../session/SessionManager.js";
import { SkillsLoader } from "../skills/SkillsLoader.js";
import { createDefaultToolRegistry } from "../tools/index.js";
import type { Agent, AgentOptions, RunOptions, RunResult } from "./types.js";
import type { AgentEvent } from "./events.js";
import type { LLMProvider } from "../providers/Provider.js";
import type { ToolRegistry } from "../tools/ToolRegistry.js";
import type { MessageRecord, Session } from "../session/Session.js";

interface PreparedRun {
  runner: AgentRunner;
  spec: AgentRunSpec;
  sessions: SessionManager;
  session: Session;
  sessionKey: string;
  input: string;
  initialMessages: AgentRunSpec["initialMessages"];
}

export class AgentLoop implements Agent {
  readonly configDir: string;
  private readonly config?: Config;
  private readonly agentKey: string;
  private readonly modelOverride?: string;
  private readonly maxIterationsOverride?: number;
  private readonly maxToolResultCharsOverride?: number;
  private readonly providerOverride?: LLMProvider;
  private readonly tools: ToolRegistry;
  private readonly approveCommand?: (command: string) => Promise<boolean> | boolean;
  private sessions?: SessionManager;
  private readonly sessionsDirOverride?: string;
  private readonly defaultSessionKey?: string;
  private readonly sessionSource?: string;

  constructor(options: AgentOptions = {}) {
    this.configDir = options.workspace ?? path.join(process.cwd(), ".mini-agent");
    this.config = options.config;
    this.agentKey = options.agentKey ?? "default";
    this.providerOverride = options.provider;
    this.modelOverride = options.model;
    this.maxIterationsOverride = options.maxIterations;
    this.maxToolResultCharsOverride = options.maxToolResultChars;
    this.tools = options.tools ?? createDefaultToolRegistry();
    this.approveCommand = options.approveCommand;
    this.sessionsDirOverride = options.sessionsDir;
    this.sessions = options.sessions;
    this.defaultSessionKey = options.sessionKey;
    this.sessionSource = options.sessionSource;
  }

  async run(input: string, options: RunOptions = {}): Promise<RunResult> {
    const prepared = await this.prepare(input, options);
    const result = await prepared.runner.run(prepared.spec);
    await this.persist(prepared, result);
    return this.finish(prepared, result);
  }

  async *stream(input: string, options: RunOptions = {}): AsyncIterable<AgentEvent> {
    const prepared = await this.prepare(input, options);
    let result: AgentRunResult | undefined;
    for await (const event of prepared.runner.runStream(prepared.spec)) {
      if (event.type === "done") {
        result = event.result;
      }
      yield event;
    }
    if (result) {
      await this.persist(prepared, result);
    }
  }

  private async prepare(input: string, options: RunOptions): Promise<PreparedRun> {
    const config = this.config ?? await ensureDefaultConfig(this.configDir);
    const agentConfig = config.agents[this.agentKey];
    if (!agentConfig) {
      throw new Error(
        `Unknown agent "${this.agentKey}". Available agents: ${Object.keys(config.agents).join(", ")}.`
      );
    }

    const sessionKey = options.sessionKey ?? this.defaultSessionKey ?? "default";
    const sessions = this.sessionManager(config.sessions.dir);
    const session = await sessions.getOrCreate(sessionKey);

    // Per-session workspace from metadata; falls back to configDir.
    const rawWorkspace = (typeof session.metadata.workspace === "string" && session.metadata.workspace)
      ? session.metadata.workspace
      : this.configDir;
    const sessionWorkspace = path.resolve(path.resolve(this.configDir), rawWorkspace);

    const model = this.modelOverride ?? agentConfig.model;

    const provider = this.providerOverride ?? createProvider(agentConfig, config.providers);

    const context = new ContextBuilder({ workspace: sessionWorkspace });
    const skills = new SkillsLoader(sessionWorkspace);
    const initialMessages = await context.buildMessages({
      input,
      sessionKey,
      history: sessions.getHistory(session, {
        maxMessages: config.sessions.maxHistoryMessages,
        maxChars: config.sessions.maxHistoryChars
      }),
      skillsSummary: await skills.summaryText()
    });

    const spec: AgentRunSpec = {
      initialMessages,
      tools: this.tools,
      model,
      maxIterations: this.maxIterationsOverride ?? agentConfig.maxIterations,
      maxToolResultChars: this.maxToolResultCharsOverride ?? agentConfig.maxToolResultChars,
      workspace: sessionWorkspace,
      contextWindowTokens: agentConfig.contextWindowTokens,
      thinking: agentConfig.thinking,
      effort: agentConfig.effort,
      approveCommand: options.approveCommand ?? this.approveCommand,
      signal: options.signal
    };

    return { runner: new AgentRunner(provider), spec, sessions, session, sessionKey, input, initialMessages };
  }

  private async persist(prepared: PreparedRun, result: AgentRunResult): Promise<void> {
    prepared.session.messages.push(toRecord({ role: "user", content: prepared.input }));
    for (const message of result.messages.slice(prepared.initialMessages.length)) {
      prepared.session.messages.push(toRecord(message));
    }
    // Attach reasoning content to the last assistant message if present.
    if (result.reasoningContent) {
      const lastAssistant = findLastAssistantMessage(prepared.session.messages);
      if (lastAssistant) {
        lastAssistant.thinking = result.reasoningContent;
      }
    }
    await prepared.sessions.save(prepared.session);
  }

  private finish(prepared: PreparedRun, result: AgentRunResult): RunResult {
    return {
      content: result.finalContent ?? "",
      sessionKey: prepared.sessionKey,
      toolsUsed: result.toolsUsed,
      usage: result.usage
    };
  }

  private sessionManager(configSessionsDir: string): SessionManager {
    if (!this.sessions) {
      this.sessions = new SessionManager({
        sessionsDir: this.sessionsDirOverride ?? configSessionsDir,
        source: this.sessionSource
      });
    }
    return this.sessions;
  }
}

export function createAgent(options: AgentOptions = {}): Agent {
  return new AgentLoop(options);
}

function toRecord(message: Record<string, unknown>): MessageRecord {
  const record: MessageRecord = {
    role: typeof message.role === "string" ? message.role : "assistant",
    content: message.content,
    timestamp: new Date().toISOString()
  };
  if (typeof message.tool_call_id === "string") {
    record.tool_call_id = message.tool_call_id;
  }
  if (typeof message.name === "string") {
    record.name = message.name;
  }
  if (message.tool_calls) {
    record.tool_calls = message.tool_calls;
  }
  if (typeof message.thinking === "string") {
    record.thinking = message.thinking;
  }
  return record;
}

function findLastAssistantMessage(messages: MessageRecord[]): MessageRecord | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]!.role === "assistant") {
      return messages[i];
    }
  }
  return undefined;
}
