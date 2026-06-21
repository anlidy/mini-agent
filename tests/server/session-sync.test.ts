import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import os from "node:os";
import path from "node:path";
import { Readable, Writable } from "node:stream";

import { describe, expect, it } from "vitest";

import type { Config } from "../../src/config/Config.js";
import { defaultConfig } from "../../src/config/loadConfig.js";
import type { ChatRequest, LLMProvider, LLMResponse, ProviderStreamEvent } from "../../src/providers/Provider.js";
import { createRequestHandler, type MiniAgentRequestHandler } from "../../src/server/index.js";
import type { ServerMessage } from "../../src/server/protocol.js";
import { bindAgentConnection, type AgentSocket } from "../../src/server/wsHandler.js";

class StreamingProvider implements LLMProvider {
  constructor(private readonly text: string) {}
  defaultModel(): string {
    return "sync-model";
  }
  async chat(): Promise<LLMResponse> {
    return { content: this.text, toolCalls: [], finishReason: "stop", usage: {} };
  }
  async *chatStream(_request: ChatRequest): AsyncIterable<ProviderStreamEvent> {
    yield { type: "delta", content: this.text };
    yield { type: "done", response: { content: this.text, toolCalls: [], finishReason: "stop", usage: {} } };
  }
}

class FakeSocket implements AgentSocket {
  private readonly messageHandlers: Array<(message: string) => void> = [];
  private readonly closeHandlers: Array<() => void> = [];
  private readonly queued: ServerMessage[] = [];
  private readonly waiters: Array<(message: ServerMessage) => void> = [];

  send(message: ServerMessage): void {
    const waiter = this.waiters.shift();
    if (waiter) {
      waiter(message);
      return;
    }
    this.queued.push(message);
  }
  onMessage(handler: (message: string) => void): void {
    this.messageHandlers.push(handler);
  }
  onClose(handler: () => void): void {
    this.closeHandlers.push(handler);
  }
  clientSend(message: object): void {
    for (const handler of this.messageHandlers) {
      handler(JSON.stringify(message));
    }
  }
  close(): void {
    for (const handler of this.closeHandlers) {
      handler();
    }
  }
  next(): Promise<ServerMessage> {
    const queued = this.queued.shift();
    if (queued) {
      return Promise.resolve(queued);
    }
    return new Promise((resolve) => this.waiters.push(resolve));
  }
  async waitForDone(): Promise<void> {
    for (;;) {
      const message = await this.next();
      if (message.type === "done" || message.type === "error") {
        return;
      }
    }
  }
}

async function setup(workspace: string): Promise<MiniAgentRequestHandler> {
  const config = defaultConfig(workspace);
  config.provider.apiKey = "secret-key";
  await mkdir(path.join(workspace, ".mini-agent"), { recursive: true });
  await writeFile(path.join(workspace, ".mini-agent", "config.json"), `${JSON.stringify(config, null, 2)}\n`, "utf8");
  return createRequestHandler({ workspace });
}

async function call(handler: MiniAgentRequestHandler, method: string, url: string): Promise<{ status: number; json: unknown }> {
  const req = Readable.from([]) as IncomingMessage;
  Object.assign(req, { method, url, headers: {} });
  let responseBody = "";
  const res = new Writable({
    write(chunk, _encoding, callback) {
      responseBody += chunk.toString();
      callback();
    }
  }) as ServerResponse & { statusCode: number };
  res.statusCode = 200;
  res.setHeader = () => res;
  res.getHeader = () => undefined;
  res.removeHeader = () => undefined;
  res.writeHead = (statusCode: number) => {
    res.statusCode = statusCode;
    return res;
  };
  res.end = (chunk?: unknown) => {
    if (chunk) {
      responseBody += String(chunk);
    }
    return res;
  };
  await handler.handle(req, res);
  return { status: res.statusCode, json: responseBody ? (JSON.parse(responseBody) as unknown) : undefined };
}

describe("session history consistency between HTTP and WebSocket", () => {
  it("reflects WS-written turns when a non-default session is read over HTTP", async () => {
    const workspace = await mkdtemp(path.join(os.tmpdir(), "mini-agent-session-sync-"));
    const handler = await setup(workspace);
    const sessionKey = "session-1782036891370";

    // 1. Frontend opens a brand-new session first: HTTP read caches it as empty.
    const before = await call(handler, "GET", `/api/sessions/${sessionKey}`);
    expect((before.json as { messages: unknown[] }).messages).toEqual([]);

    // 2. Agent runs a turn over WS, sharing the handler's SessionManager.
    const socket = new FakeSocket();
    bindAgentConnection(socket, new URL(`http://localhost/ws?session=${sessionKey}`), {
      workspace,
      state: handler.state,
      sessions: handler.sessions,
      providerFactory: () => new StreamingProvider("hello from agent"),
      approvalTimeoutMs: 100
    });
    await socket.next(); // { type: "session" }
    socket.clientSend({ type: "user_message", text: "hi there" });
    await socket.waitForDone();

    // 3. Frontend re-reads the same session over HTTP (the onDone refresh path).
    const after = await call(handler, "GET", `/api/sessions/${sessionKey}`);
    const messages = (after.json as { messages: Array<{ role: string; content: unknown }> }).messages;
    expect(messages.map((message) => message.role)).toEqual(["user", "assistant"]);
    expect(messages[0]?.content).toBe("hi there");
    expect(messages[1]?.content).toBe("hello from agent");
  });
});
