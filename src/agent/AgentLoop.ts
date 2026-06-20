import { ContextBuilder } from "./ContextBuilder.js";
import { AgentRunner } from "./AgentRunner.js";
import { ensureDefaultConfig } from "../config/loadConfig.js";
import { OpenAIProvider } from "../providers/OpenAIProvider.js";
import { SessionManager } from "../session/SessionManager.js";
import { SkillsLoader } from "../skills/SkillsLoader.js";
import { createDefaultToolRegistry } from "../tools/index.js";
import type { Agent, AgentOptions, RunOptions, RunResult } from "./types.js";
import type { LLMProvider } from "../providers/Provider.js";
import type { ToolRegistry } from "../tools/ToolRegistry.js";
import type { MessageRecord } from "../session/Session.js";

export class AgentLoop implements Agent {
  readonly workspace: string;
  readonly model?: string;
  readonly maxIterations?: number;
  private readonly maxToolResultChars?: number;
  private readonly provider?: LLMProvider;
  private readonly tools: ToolRegistry;
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
    this.sessionsDir = options.sessionsDir;
    this.defaultSessionKey = options.sessionKey;
  }

  async run(input: string, options: RunOptions = {}): Promise<RunResult> {
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
    const runner = new AgentRunner(provider);
    const result = await runner.run({
      initialMessages,
      tools: this.tools,
      model,
      maxIterations: this.maxIterations ?? config.agent.maxIterations,
      maxToolResultChars: this.maxToolResultChars ?? config.agent.maxToolResultChars,
      workspace: this.workspace,
      contextWindowTokens: config.agent.contextWindowTokens,
      signal: options.signal
    });
    session.messages.push(toRecord({ role: "user", content: input }));
    for (const message of result.messages.slice(initialMessages.length)) {
      session.messages.push(toRecord(message));
    }
    await sessions.save(session);
    return {
      content: result.finalContent ?? "",
      sessionKey,
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
