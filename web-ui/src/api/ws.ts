export type ClientMessage =
  | { type: "user_message"; text: string }
  | { type: "abort" }
  | { type: "approve_command"; id: string; approved: boolean };

export type AgentDoneResult = {
  finalContent: string | null;
  messages: Array<Record<string, unknown>>;
  toolsUsed: string[];
  usage: Record<string, number>;
  stopReason: "completed" | "max_iterations" | "error" | "aborted";
  error?: string;
  toolEvents: Array<{ name: string; status: "ok" | "error"; detail: string }>;
};

export type ServerMessage =
  | { type: "session"; key: string }
  | { type: "token"; text: string }
  | { type: "tool_call"; id: string; name: string; arguments: Record<string, unknown> }
  | { type: "tool_result"; id: string; name: string; status: "ok" | "error"; content: string }
  | { type: "done"; result: AgentDoneResult }
  | { type: "error"; error: string }
  | { type: "approve_request"; id: string; command: string }
  | { type: "turn_rejected"; reason: string };

export interface AgentSocket {
  send(message: ClientMessage): void;
  close(): void;
}

export function createAgentSocket(
  sessionKey: string,
  handlers: {
    onMessage(message: ServerMessage): void;
    onOpen?(): void;
    onClose?(): void;
    onError?(error: Event): void;
  }
): AgentSocket {
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  const socket = new WebSocket(`${protocol}//${location.host}/ws?session=${encodeURIComponent(sessionKey)}`);

  socket.addEventListener("open", () => handlers.onOpen?.());
  socket.addEventListener("message", (event) => {
    handlers.onMessage(JSON.parse(String(event.data)) as ServerMessage);
  });
  socket.addEventListener("close", () => handlers.onClose?.());
  socket.addEventListener("error", (event) => handlers.onError?.(event));

  return {
    send(message) {
      socket.send(JSON.stringify(message));
    },
    close() {
      socket.close();
    }
  };
}
