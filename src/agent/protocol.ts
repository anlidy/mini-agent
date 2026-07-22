import type { AgentEvent } from "./events.js";
import type { SessionSummary } from "../session/SessionManager.js";
import type { Session } from "../session/Session.js";

export interface TurnOptions {
  sessionKey: string;
  approveCommand?: (command: string) => Promise<boolean> | boolean;
  signal?: AbortSignal;
}

export interface AgentProtocol {
  /** Start a turn, yielding streaming events. A terminal `done` means the
   *  result is durable; failures end with a terminal `error` instead. */
  runTurn(input: string, options: TurnOptions): AsyncIterable<AgentEvent>;

  /** Abort the in-flight turn. No-op when idle. */
  abortTurn(): void;

  /** List persisted sessions, newest first. */
  listSessions(): Promise<SessionSummary[]>;

  /** Explicitly create and persist a session. */
  createSession(options?: { key?: string; workspace?: string | null }): Promise<Session>;

  /** Read a session by key, or undefined when not found. */
  getSession(key: string): Promise<Session | undefined>;

  /** Delete a session and its JSONL file. */
  deleteSession(key: string): Promise<void>;

  /** Update session metadata (title, workspace). */
  updateSession(key: string, patch: { revision: number; title?: string; workspace?: string | null }): Promise<Session>;

  /** Tool definitions registered with this agent. */
  getToolDefinitions(): Array<Record<string, unknown>>;
}
