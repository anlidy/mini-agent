import type { Agent, RunResult } from "../agent/types.js";
import type { AgentProtocol, TurnOptions } from "../agent/protocol.js";
import type { AgentEvent } from "../agent/events.js";
import type { Config } from "../config/Config.js";
import { SessionBusyError, SessionManager } from "../session/SessionManager.js";
import type { SessionSummary } from "../session/SessionManager.js";
import type { Session } from "../session/Session.js";
import type { ToolRegistry } from "../tools/ToolRegistry.js";
import { RuntimePaths } from "../runtime/paths.js";

export interface DirectAgentClientOptions {
  agent: Agent;
  sessions: SessionManager;
  tools: ToolRegistry;
  config?: Config;
  workspace?: string;
  runtimeHome?: string;
}

export class DirectAgentClient implements AgentProtocol {
  private readonly agent: Agent;
  private readonly sessions: SessionManager;
  private readonly tools: ToolRegistry;
  private activeAbort: AbortController | undefined;
  private readonly paths: RuntimePaths;

  constructor(options: DirectAgentClientOptions) {
    this.agent = options.agent;
    this.sessions = options.sessions;
    this.tools = options.tools;
    this.paths = new RuntimePaths({ home: options.runtimeHome, workspace: options.workspace });
  }

  async *runTurn(input: string, options: TurnOptions): AsyncIterable<AgentEvent> {
    this.activeAbort = new AbortController();
    const signal = options.signal
      ? AbortSignal.any([options.signal, this.activeAbort.signal])
      : this.activeAbort.signal;

    try {
      if (this.agent.stream) {
        yield* this.agent.stream(input, {
          sessionKey: options.sessionKey,
          signal,
          approveCommand: options.approveCommand
        });
      } else {
        const result = await this.agent.run(input, {
          sessionKey: options.sessionKey,
          signal,
          approveCommand: options.approveCommand
        });
        yield { type: "done", result: toRunResult(result) };
      }
    } finally {
      this.activeAbort = undefined;
    }
  }

  abortTurn(): void {
    this.activeAbort?.abort();
  }

  async listSessions(): Promise<SessionSummary[]> {
    return this.sessions.listSessions();
  }

  async createSession(options: { key?: string; workspace?: string | null } = {}): Promise<Session> {
    const metadata = typeof options.workspace === "string"
      ? { workspace: await this.paths.normalizeWorkspace(options.workspace) }
      : {};
    return this.sessions.create(options.key, metadata);
  }

  async getSession(key: string): Promise<Session | undefined> {
    return this.sessions.get(key);
  }

  async deleteSession(key: string): Promise<void> {
    return this.sessions.deleteSession(key);
  }

  async updateSession(key: string, patch: { revision: number; title?: string; workspace?: string | null }): Promise<Session> {
    if (this.sessions.isBusy(key)) {
      throw new SessionBusyError(key);
    }
    const session = await this.sessions.get(key);
    if (!session) {
      throw new Error(`Session "${key}" not found.`);
    }
    session.revision = patch.revision;
    if (typeof patch.title === "string" && patch.title.trim()) {
      session.metadata.title = patch.title.trim();
    }
    if (patch.workspace === null) {
      delete session.metadata.workspace;
    } else if (typeof patch.workspace === "string" && patch.workspace.trim()) {
      session.metadata.workspace = await this.paths.normalizeWorkspace(patch.workspace);
    }
    return this.sessions.save(session);
  }

  getToolDefinitions(): Array<Record<string, unknown>> {
    return this.tools.getDefinitions();
  }
}

function toRunResult(result: RunResult): import("../agent/AgentRunner.js").AgentRunResult {
  return {
    finalContent: result.content,
    reasoningContent: null,
    messages: [],
    toolsUsed: result.toolsUsed,
    usage: result.usage,
    stopReason: "completed",
    toolEvents: []
  };
}
