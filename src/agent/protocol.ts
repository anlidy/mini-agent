import type { AgentEvent } from "./events.js";
import type { SessionSummary } from "../session/SessionManager.js";
import type { Session } from "../session/Session.js";

export interface TurnOptions {
  sessionKey: string;
  approveCommand?: (command: string) => Promise<boolean> | boolean;
  signal?: AbortSignal;
}

export interface AgentProtocol {
  /** Start a turn, yielding streaming events. Consume the stream and watch for
   *  the terminal `done` event to get the complete result. */
  runTurn(input: string, options: TurnOptions): AsyncIterable<AgentEvent>;

  /** Abort the in-flight turn. No-op when idle. */
  abortTurn(): void;

  /** List persisted sessions, newest first. */
  listSessions(): Promise<SessionSummary[]>;

  /** Read a session by key, or undefined when not found. */
  getSession(key: string): Promise<Session | undefined>;

  /** Delete a session and its JSONL file. */
  deleteSession(key: string): Promise<void>;

  /** Update session metadata (title, workspace). */
  updateSession(key: string, patch: { title?: string; workspace?: string }): Promise<void>;

  /** Tool definitions registered with this agent. */
  getToolDefinitions(): Array<Record<string, unknown>>;
}
