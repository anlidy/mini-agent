import type { AgentRunResult } from "./AgentRunner.js";

/**
 * Streaming events emitted by AgentRunner.runStream / AgentLoop.stream.
 * A consumer can render tokens live, surface tool activity, and receive a
 * single terminal `done` (or `error`) event carrying the full run result.
 */
export type AgentEvent =
  | { type: "token"; text: string }
  | { type: "tool_call"; id: string; name: string; arguments: Record<string, unknown> }
  | { type: "tool_result"; id: string; name: string; status: "ok" | "error"; content: string }
  | { type: "done"; result: AgentRunResult }
  | { type: "error"; error: string };
