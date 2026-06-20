import { randomUUID, createHash } from "node:crypto";
import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";

import { AgentLoop } from "../agent/AgentLoop.js";
import type { Config } from "../config/Config.js";
import type { LLMProvider } from "../providers/Provider.js";
import { createDefaultToolRegistry } from "../tools/index.js";
import { parseClientMessage, type ServerMessage } from "./protocol.js";
import type { ConfigState } from "./routes/config.js";

export interface WebSocketHandlerOptions {
  workspace: string;
  state: ConfigState;
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

class SimpleWebSocket implements AgentSocket {
  private buffer = Buffer.alloc(0);
  private closed = false;
  private readonly messageHandlers: MessageHandler[] = [];
  private readonly closeHandlers: Array<() => void> = [];

  constructor(private readonly socket: Duplex, head: Buffer) {
    this.socket.on("data", (chunk: Buffer) => this.read(chunk));
    this.socket.on("close", () => this.emitClose());
    this.socket.on("error", () => this.emitClose());
    if (head.length > 0) {
      this.read(head);
    }
  }

  onMessage(handler: MessageHandler): void {
    this.messageHandlers.push(handler);
  }

  onClose(handler: () => void): void {
    this.closeHandlers.push(handler);
  }

  send(message: ServerMessage): void {
    if (this.closed) {
      return;
    }
    this.socket.write(encodeFrame(Buffer.from(JSON.stringify(message), "utf8"), 1));
  }

  close(): void {
    if (this.closed) {
      return;
    }
    this.closed = true;
    this.socket.end(encodeFrame(Buffer.alloc(0), 8));
  }

  private read(chunk: Buffer): void {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    while (this.buffer.length > 0) {
      const frame = decodeFrame(this.buffer);
      if (!frame) {
        return;
      }
      this.buffer = this.buffer.subarray(frame.consumed);
      if (frame.opcode === 8) {
        this.close();
        return;
      }
      if (frame.opcode === 9) {
        this.socket.write(encodeFrame(frame.payload, 10));
        continue;
      }
      if (frame.opcode === 1) {
        const text = frame.payload.toString("utf8");
        for (const handler of this.messageHandlers) {
          handler(text);
        }
      }
    }
  }

  private emitClose(): void {
    if (this.closed) {
      return;
    }
    this.closed = true;
    for (const handler of this.closeHandlers) {
      handler();
    }
  }
}

export function handleWebSocketUpgrade(
  req: IncomingMessage,
  socket: Duplex,
  head: Buffer,
  options: WebSocketHandlerOptions
): boolean {
  const url = new URL(req.url ?? "/", "http://localhost");
  if (url.pathname !== "/ws") {
    return false;
  }
  const key = req.headers["sec-websocket-key"];
  if (typeof key !== "string") {
    socket.destroy();
    return true;
  }

  const accept = createHash("sha1")
    .update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
    .digest("base64");
  socket.write([
    "HTTP/1.1 101 Switching Protocols",
    "Upgrade: websocket",
    "Connection: Upgrade",
    `Sec-WebSocket-Accept: ${accept}`,
    "\r\n"
  ].join("\r\n"));

  const ws = new SimpleWebSocket(socket, head);
  bindAgentConnection(ws, url, options);
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
    model: config.provider.model,
    tools: createDefaultToolRegistry({ search: config.search, exec: config.exec }),
    provider: options.providerFactory?.(config),
    approveCommand
  });
}

interface DecodedFrame {
  opcode: number;
  payload: Buffer;
  consumed: number;
}

function decodeFrame(buffer: Buffer): DecodedFrame | undefined {
  if (buffer.length < 2) {
    return undefined;
  }
  const firstByte = buffer[0] ?? 0;
  const secondByte = buffer[1] ?? 0;
  const opcode = firstByte & 0x0f;
  const masked = (secondByte & 0x80) !== 0;
  let length = secondByte & 0x7f;
  let offset = 2;
  if (length === 126) {
    if (buffer.length < offset + 2) {
      return undefined;
    }
    length = buffer.readUInt16BE(offset);
    offset += 2;
  } else if (length === 127) {
    if (buffer.length < offset + 8) {
      return undefined;
    }
    const longLength = buffer.readBigUInt64BE(offset);
    if (longLength > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new Error("WebSocket frame too large");
    }
    length = Number(longLength);
    offset += 8;
  }

  const maskOffset = offset;
  if (masked) {
    offset += 4;
  }
  if (buffer.length < offset + length) {
    return undefined;
  }
  const payload = Buffer.from(buffer.subarray(offset, offset + length));
  if (masked) {
    const mask = buffer.subarray(maskOffset, maskOffset + 4);
    for (let index = 0; index < payload.length; index += 1) {
      payload[index] = (payload[index] ?? 0) ^ (mask[index % 4] ?? 0);
    }
  }
  return { opcode, payload, consumed: offset + length };
}

function encodeFrame(payload: Buffer, opcode: number): Buffer {
  if (payload.length < 126) {
    return Buffer.concat([Buffer.from([0x80 | opcode, payload.length]), payload]);
  }
  if (payload.length <= 0xffff) {
    const header = Buffer.alloc(4);
    header[0] = 0x80 | opcode;
    header[1] = 126;
    header.writeUInt16BE(payload.length, 2);
    return Buffer.concat([header, payload]);
  }
  const header = Buffer.alloc(10);
  header[0] = 0x80 | opcode;
  header[1] = 127;
  header.writeBigUInt64BE(BigInt(payload.length), 2);
  return Buffer.concat([header, payload]);
}
