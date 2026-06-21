import { ContextBuilder } from "./ContextBuilder.js";
import { AgentRunner, type AgentRunSpec, type AgentRunResult } from "./AgentRunner.js";
import { ensureDefaultConfig } from "../config/loadConfig.js";
import { OpenAIProvider } from "../providers/OpenAIProvider.js";
import { SessionManager } from "../session/SessionManager.js";
import { SkillsLoader } from "../skills/SkillsLoader.js";
import { createDefaultToolRegistry } from "../tools/index.js";
import type { Agent, AgentOptions, RunOptions, RunResult } from "./types.js";
import type { AgentEvent } from "./events.js";
import type { LLMProvider } from "../providers/Provider.js";
import type { ToolRegistry } from "../tools/ToolRegistry.js";
import type { MessageRecord, Session } from "../session/Session.js";

/** Per-turn state shared between run() and stream(). */
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
  readonly workspace: string;
  readonly model?: string;
  readonly maxIterations?: number;
  private readonly maxToolResultChars?: number;
  private readonly provider?: LLMProvider;
  private readonly tools: ToolRegistry;
  private readonly approveCommand?: (command: string) => Promise<boolean> | boolean;
  private sessions?: SessionManager;
  private readonly sessionsDir?: string;
  private readonly defaultSessionKey?: string;

  constructor(options: AgentOptions = {}) {
    this.workspace = options.workspace ?? process.cwd();
    this.model = options.model;
    this.maxIterations = options.maxIterations;
    this.maxToolResultChars = options.maxToolResultChars;
    this.provider = options.provider;
    this.tools = options.tools ?? createDefaultToolRegistry();
    this.approveCommand = options.approveCommand;
    this.sessionsDir = options.sessionsDir;
    this.sessions = options.sessions;
    this.defaultSessionKey = options.sessionKey;
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

  /** Build session, provider, context, and the runner spec shared by run/stream. */
  private async prepare(input: string, options: RunOptions): Promise<PreparedRun> {
    const config = await ensureDefaultConfig(this.workspace);
    const sessionKey = options.sessionKey ?? this.defaultSessionKey ?? config.sessions.defaultKey;
    const sessions = this.sessionManager(config.sessions.dir);
    const session = await sessions.getOrCreate(sessionKey);
    const model = this.model ?? config.provider.model ?? "deepseek-chat";
    const provider = this.provider ?? new OpenAIProvider({
      apiKey: this.resolveApiKey(config.provider.apiKey),
      baseUrl: config.provider.baseUrl,
      model,
      timeoutMs: config.provider.timeoutMs
    });
    const context = new ContextBuilder({ workspace: this.workspace });
    const skills = new SkillsLoader(this.workspace);
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
      maxIterations: this.maxIterations ?? config.agent.maxIterations,
      maxToolResultChars: this.maxToolResultChars ?? config.agent.maxToolResultChars,
      workspace: this.workspace,
      contextWindowTokens: config.agent.contextWindowTokens,
      approveCommand: options.approveCommand ?? this.approveCommand,
      signal: options.signal
    };
    return { runner: new AgentRunner(provider), spec, sessions, session, sessionKey, input, initialMessages };
  }

  /** Append the turn's messages to the session and persist it. */
  private async persist(prepared: PreparedRun, result: AgentRunResult): Promise<void> {
    prepared.session.messages.push(toRecord({ role: "user", content: prepared.input }));
    for (const message of result.messages.slice(prepared.initialMessages.length)) {
      prepared.session.messages.push(toRecord(message));
    }
    await prepared.sessions.save(prepared.session);
  }

  /** Shape the RunResult returned to callers of run(). */
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
        workspace: this.workspace,
        sessionsDir: this.sessionsDir ?? configSessionsDir
      });
    }
    return this.sessions;
  }

  /**
   * Resolve the provider API key from config or the MINI_AGENT_API_KEY env var.
   * Fails fast with an actionable message instead of letting the first HTTP
   * request return an opaque 401. Only reached when no provider was injected.
   */
  private resolveApiKey(configured?: string): string {
    const apiKey = configured ?? process.env.MINI_AGENT_API_KEY;
    if (!apiKey) {
      throw new Error(
        "Missing provider API key. Set provider.apiKey in .mini-agent/config.json " +
        "or the MINI_AGENT_API_KEY environment variable."
      );
    }
    return apiKey;
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
  return record;
}
