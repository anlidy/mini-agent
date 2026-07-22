import { ContextBuilder } from "./ContextBuilder.js";
import { AgentRunner, type AgentRunSpec, type AgentRunResult } from "./AgentRunner.js";
import type { Config } from "../config/Config.js";
import { ensureDefaultConfig } from "../config/loadConfig.js";
import { createProvider } from "../providers/factory.js";
import { SessionManager } from "../session/SessionManager.js";
import { SkillsLoader } from "../skills/SkillsLoader.js";
import { createDefaultToolRegistry } from "../tools/index.js";
import { createReadSkillTool } from "../tools/skills.js";
import type { Agent, AgentOptions, RunOptions, RunResult } from "./types.js";
import type { AgentEvent } from "./events.js";
import type { LLMProvider } from "../providers/Provider.js";
import type { ToolRegistry } from "../tools/ToolRegistry.js";
import type { MessageRecord, Session } from "../session/Session.js";
import { RuntimePaths } from "../runtime/paths.js";

interface PreparedRun {
  runner: AgentRunner;
  spec: AgentRunSpec;
  sessions: SessionManager;
  session: Session;
  sessionKey: string;
  input: string;
  initialMessages: AgentRunSpec["initialMessages"];
  releaseLease: () => void;
}

export class AgentTurnError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "AgentTurnError";
    this.code = code;
  }
}

export class AgentLoop implements Agent {
  readonly configDir: string;
  private readonly paths: RuntimePaths;
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
    this.paths = new RuntimePaths({ home: options.runtimeHome, workspace: options.workspace });
    this.configDir = this.paths.home;
    this.config = options.config;
    this.agentKey = options.agentKey ?? "default";
    this.providerOverride = options.provider;
    this.modelOverride = options.model;
    this.maxIterationsOverride = options.maxIterations;
    this.maxToolResultCharsOverride = options.maxToolResultChars;
    this.tools = options.tools ?? createDefaultToolRegistry();
    if (!this.tools.get("read_skill")) {
      this.tools.register(createReadSkillTool(this.paths.skillsDir));
    }
    this.approveCommand = options.approveCommand;
    this.sessionsDirOverride = options.sessionsDir;
    this.sessions = options.sessions;
    this.defaultSessionKey = options.sessionKey;
    this.sessionSource = options.sessionSource;
  }

  async run(input: string, options: RunOptions = {}): Promise<RunResult> {
    const prepared = await this.prepare(input, options);
    try {
      const result = await prepared.runner.run(prepared.spec);
      assertCommittable(result);
      await this.persist(prepared, result);
      return this.finish(prepared, result);
    } finally {
      prepared.releaseLease();
    }
  }

  async *stream(input: string, options: RunOptions = {}): AsyncIterable<AgentEvent> {
    let prepared: PreparedRun | undefined;
    try {
      prepared = await this.prepare(input, options);
      let result: AgentRunResult | undefined;
      for await (const event of prepared.runner.runStream(prepared.spec)) {
        if (event.type === "done") {
          result = event.result;
        } else if (event.type !== "error") {
          yield event;
        }
      }
      if (!result) {
        throw new AgentTurnError("turn_failed", "Agent runner ended without a result.");
      }
      assertCommittable(result);
      await this.persist(prepared, result);
      yield { type: "done", result };
    } catch (error) {
      yield {
        type: "error",
        error: error instanceof Error ? error.message : String(error),
        code: errorCode(error)
      };
    } finally {
      prepared?.releaseLease();
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
    const sessions = this.sessionManager();
    const releaseLease = sessions.acquireLease(sessionKey);
    try {
      const session = await sessions.getOrCreate(sessionKey);

      const sessionWorkspace = await this.paths.effectiveWorkspace(session.metadata.workspace, sessionKey);

      const model = this.modelOverride ?? agentConfig.model;

      const provider = this.providerOverride ?? createProvider(agentConfig, config.providers);

      const context = new ContextBuilder({ workspace: sessionWorkspace });
      const skills = new SkillsLoader({ workspace: sessionWorkspace, globalSkillsDir: this.paths.skillsDir });
      const initialMessages = await context.buildMessages({
        input,
        sessionKey,
        history: sessions.getHistory(session, {
          maxMessages: config.sessions.maxHistoryMessages
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
        outputReserveTokens: agentConfig.outputReserveTokens ?? 4_096,
        thinking: agentConfig.thinking,
        effort: agentConfig.effort,
        approveCommand: options.approveCommand ?? this.approveCommand,
        signal: options.signal
      };

      return { runner: new AgentRunner(provider), spec, sessions, session, sessionKey, input, initialMessages, releaseLease };
    } catch (error) {
      releaseLease();
      throw error;
    }
  }

  private async persist(prepared: PreparedRun, result: AgentRunResult): Promise<Session> {
    const next = structuredClone(prepared.session);
    next.messages.push(toRecord({ role: "user", content: prepared.input }));
    for (const message of result.messages.slice(prepared.initialMessages.length)) {
      next.messages.push(toRecord(message));
    }
    // Attach reasoning content to the last assistant message if present.
    if (result.reasoningContent) {
      const lastAssistant = findLastAssistantMessage(next.messages);
      if (lastAssistant) {
        lastAssistant.thinking = result.reasoningContent;
      }
    }
    return prepared.sessions.save(next);
  }

  private finish(prepared: PreparedRun, result: AgentRunResult): RunResult {
    return {
      content: result.finalContent ?? "",
      sessionKey: prepared.sessionKey,
      toolsUsed: result.toolsUsed,
      usage: result.usage
    };
  }

  private sessionManager(): SessionManager {
    if (!this.sessions) {
      this.sessions = new SessionManager({
        sessionsDir: this.sessionsDirOverride ?? this.paths.sessionsDir,
        source: this.sessionSource
      });
    }
    return this.sessions;
  }
}

function assertCommittable(result: AgentRunResult): void {
  if (result.stopReason === "completed" || result.stopReason === "max_iterations") {
    return;
  }
  const code = result.stopReason === "aborted" ? "turn_aborted" : "provider_error";
  throw new AgentTurnError(code, result.error ?? result.finalContent ?? "Turn failed.");
}

function errorCode(error: unknown): string {
  if (error && typeof error === "object" && "code" in error && typeof error.code === "string") {
    return error.code;
  }
  return "turn_failed";
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
