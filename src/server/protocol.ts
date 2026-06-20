import type { AgentEvent } from "../agent/events.js";

export type ClientMessage =
  | { type: "user_message"; text: string }
  | { type: "abort" }
  | { type: "approve_command"; id: string; approved: boolean };

export type ServerMessage =
  | { type: "session"; key: string }
  | AgentEvent
  | { type: "approve_request"; id: string; command: string }
  | { type: "turn_rejected"; reason: string };

export function parseClientMessage(raw: string): ClientMessage {
  const parsed = JSON.parse(raw) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Message must be a JSON object");
  }
  const message = parsed as Record<string, unknown>;
  if (message.type === "user_message" && typeof message.text === "string") {
    return { type: "user_message", text: message.text };
  }
  if (message.type === "abort") {
    return { type: "abort" };
  }
  if (message.type === "approve_command" && typeof message.id === "string" && typeof message.approved === "boolean") {
    return { type: "approve_command", id: message.id, approved: message.approved };
  }
  throw new Error("Invalid client message");
}
