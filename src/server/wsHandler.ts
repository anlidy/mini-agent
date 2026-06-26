import { randomUUID } from "node:crypto";
import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocket, type WebSocketServer } from "ws";

import { AgentLoop } from "../agent/AgentLoop.js";
import type { Config } from "../config/Config.js";
import type { LLMProvider } from "../providers/Provider.js";
import type { SessionManager } from "../session/SessionManager.js";
import { createDefaultToolRegistry } from "../tools/index.js";
import { parseClientMessage, type ServerMessage } from "./protocol.js";
import type { ConfigState } from "./routes/config.js";

export interface WebSocketHandlerOptions {
  workspace: string;
  state: ConfigState;
  sessions?: SessionManager;
  providerFactory?: (config: Config) => LLMProvider;
  approvalTimeoutMs?: number;
}

interface PendingApproval {
  resolve: (approved: boolean) => void;
  timer: NodeJS.Timeout;
}

type MessageHandler = (message: string) => void;

export interface AgentSocket {
  send(message: ServerMessage): void;
  onMessage(handler: MessageHandler): void;
  onClose(handler: () => void): void;
}

class WsSocket implements AgentSocket {
  constructor(private readonly ws: WebSocket) {}

  send(message: ServerMessage): void {
    if (this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  onMessage(handler: MessageHandler): void {
    this.ws.on("message", (data) => handler(data.toString()));
  }

  onClose(handler: () => void): void {
    this.ws.on("close", handler);
  }
}

export function handleWebSocketUpgrade(
  req: IncomingMessage,
  socket: Duplex,
  head: Buffer,
  wss: WebSocketServer,
  options: WebSocketHandlerOptions
): boolean {
  const url = new URL(req.url ?? "/", "http://localhost");
  if (url.pathname !== "/ws") {
    return false;
  }
  wss.handleUpgrade(req, socket, head, (ws) => {
    bindAgentConnection(new WsSocket(ws), url, options);
  });
  return true;
}

export function bindAgentConnection(ws: AgentSocket, url: URL, options: WebSocketHandlerOptions): void {
  const sessionKey = url.searchParams.get("session") || `session-${randomUUID()}`;
  const approvals = new Map<string, PendingApproval>();
  let activeTurn: AbortController | undefined;
  let agentVersion = -1;
  let agent = buildAgent(options, sessionKey, approveCommand);

  ws.send({ type: "session", key: sessionKey });

  ws.onMessage((raw) => {
    let message;
    try {
      message = parseClientMessage(raw);
    } catch (error) {
      ws.send({ type: "error", error: error instanceof Error ? error.message : String(error) });
      return;
    }

    if (message.type === "approve_command") {
      const pending = approvals.get(message.id);
      if (pending) {
        clearTimeout(pending.timer);
        approvals.delete(message.id);
        pending.resolve(message.approved);
      }
      return;
    }
    if (message.type === "abort") {
      activeTurn?.abort();
      return;
    }
    if (activeTurn) {
      ws.send({ type: "turn_rejected", reason: "A turn is already active on this connection." });
      return;
    }
    void runTurn(message.text);
  });

  ws.onClose(() => {
    activeTurn?.abort();
    for (const [id, pending] of approvals) {
      clearTimeout(pending.timer);
      approvals.delete(id);
      pending.resolve(false);
    }
  });

  async function runTurn(text: string): Promise<void> {
    activeTurn = new AbortController();
    try {
      if (agentVersion !== options.state.version) {
        agent = buildAgent(options, sessionKey, approveCommand);
        agentVersion = options.state.version;
      }
      for await (const event of agent.stream(text, { sessionKey, signal: activeTurn.signal })) {
        ws.send(event);
      }
    } catch (error) {
      ws.send({ type: "error", error: error instanceof Error ? error.message : String(error) });
    } finally {
      activeTurn = undefined;
    }
  }

  function approveCommand(command: string): Promise<boolean> {
    const id = randomUUID();
    ws.send({ type: "approve_request", id, command });
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        approvals.delete(id);
        resolve(false);
      }, options.approvalTimeoutMs ?? 60_000);
      approvals.set(id, { resolve, timer });
    });
  }
}

function buildAgent(
  options: WebSocketHandlerOptions,
  sessionKey: string,
  approveCommand: (command: string) => Promise<boolean>
): AgentLoop {
  const config = options.state.config;
  return new AgentLoop({
    workspace: options.workspace,
    sessionKey,
    sessionsDir: config.sessions.dir,
    sessions: options.sessions,
    model: config.provider.model,
    tools: createDefaultToolRegistry({ search: config.search, exec: config.exec }),
    provider: options.providerFactory?.(config),
    approveCommand
  });
}
