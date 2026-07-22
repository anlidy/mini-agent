import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import type { Config } from "../../src/config/Config.js";
import { defaultConfig } from "../../src/config/loadConfig.js";
import type { ChatRequest, LLMProvider, LLMResponse, ProviderStreamEvent } from "../../src/providers/Provider.js";
import type { ServerMessage } from "../../src/server/protocol.js";
import type { ConfigState } from "../../src/server/routes/config.js";
import { bindAgentConnection, type AgentSocket } from "../../src/server/wsHandler.js";
import { SessionManager } from "../../src/session/SessionManager.js";

class StreamingProvider implements LLMProvider {
  readonly requests: ChatRequest[] = [];

  constructor(private readonly script: ProviderStreamEvent[] = [
    { type: "delta", content: "Hel" },
    { type: "delta", content: "lo" },
    { type: "done", response: { content: "Hello", reasoningContent: null, toolCalls: [], finishReason: "stop", usage: {} } }
  ]) {}

  defaultModel(): string {
    return "ws-model";
  }

  async chat(): Promise<LLMResponse> {
    return { content: "chat", reasoningContent: null, toolCalls: [], finishReason: "stop", usage: {} };
  }

  async *chatStream(request: ChatRequest): AsyncIterable<ProviderStreamEvent> {
    this.requests.push(request);
    for (const event of this.script) {
      yield event;
    }
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
}

async function setup(workspace: string, provider: LLMProvider): Promise<FakeSocket> {
  const runtimeHome = path.join(workspace, "runtime");
  const config = defaultConfig(runtimeHome);
  config.providers.deepseek!.apiKey = "test-key";
  config.tools.exec = { enabled: true, timeoutMs: 1000, maxOutputChars: 2000 };
  await mkdir(runtimeHome, { recursive: true });
  await writeFile(path.join(runtimeHome, "config.json"), `${JSON.stringify(config, null, 2)}\n`, "utf8");
  const sessions = new SessionManager({ sessionsDir: path.join(runtimeHome, "sessions"), source: "test" });
  await sessions.create("demo", { workspace });
  const state: ConfigState = {
    config,
    version: 0,
    runtimeHome,
    update(next: Config) {
      this.config = next;
      this.version += 1;
    }
  };
  const socket = new FakeSocket();
  bindAgentConnection(socket, new URL("http://localhost/ws?session=demo"), {
    workspace,
    runtimeHome,
    state,
    sessions,
    providerFactory: () => provider,
    approvalTimeoutMs: 100
  });
  return socket;
}

describe("server WebSocket API", () => {
  it("rejects websocket connections without an existing session key", async () => {
    const workspace = await mkdtemp(path.join(os.tmpdir(), "mini-agent-ws-key-"));
    const runtimeHome = path.join(workspace, "runtime");
    const config = defaultConfig(runtimeHome);
    config.providers.deepseek!.apiKey = "test-key";
    await mkdir(runtimeHome, { recursive: true });
    await writeFile(path.join(runtimeHome, "config.json"), `${JSON.stringify(config, null, 2)}\n`, "utf8");
    const sessions = new SessionManager({ sessionsDir: path.join(runtimeHome, "sessions") });
    const state: ConfigState = {
      config,
      version: 0,
      runtimeHome,
      update(next: Config) {
        this.config = next;
        this.version += 1;
      }
    };
    const socket = new FakeSocket();
    bindAgentConnection(socket, new URL("http://localhost/ws"), {
      workspace,
      runtimeHome,
      state,
      sessions,
      providerFactory: () => new StreamingProvider(),
      approvalTimeoutMs: 100
    });

    const message = await socket.next();
    expect(message).toMatchObject({ type: "error", code: "session_not_found" });
  });

  it("binds a session and forwards streamed agent events", async () => {
    const workspace = await mkdtemp(path.join(os.tmpdir(), "mini-agent-ws-stream-"));
    const socket = await setup(workspace, new StreamingProvider());

    expect(await socket.next()).toEqual({ type: "session", key: "demo" });
    socket.clientSend({ type: "user_message", text: "hello" });

    expect(await socket.next()).toEqual({ type: "token", text: "Hel" });
    expect(await socket.next()).toEqual({ type: "token", text: "lo" });
    expect((await socket.next()).type).toBe("done");
  });

  it("rejects overlapping turns on one connection", async () => {
    const workspace = await mkdtemp(path.join(os.tmpdir(), "mini-agent-ws-reject-"));
    const socket = await setup(workspace, new StreamingProvider());
    await socket.next();

    socket.clientSend({ type: "user_message", text: "first" });
    socket.clientSend({ type: "user_message", text: "second" });

    const messages = [await socket.next(), await socket.next()];
    expect(messages.some((message) => message.type === "turn_rejected")).toBe(true);
  });

  it("bridges exec approval requests over the same connection", async () => {
    const workspace = await mkdtemp(path.join(os.tmpdir(), "mini-agent-ws-approval-"));
    let calls = 0;
    const provider: LLMProvider = {
      defaultModel: () => "approval-model",
      async chat(): Promise<LLMResponse> {
        return { content: "unused", reasoningContent: null, toolCalls: [], finishReason: "stop", usage: {} };
      },
      async *chatStream(): AsyncIterable<ProviderStreamEvent> {
        calls += 1;
        if (calls === 1) {
          yield {
            type: "done",
            response: {
              content: null,
              reasoningContent: null,
              finishReason: "tool_calls",
              toolCalls: [{ id: "call_1", name: "exec", arguments: { command: "echo approved" } }],
              usage: {}
            }
          };
        } else {
          yield {
            type: "done",
            response: { content: "finished", reasoningContent: null, toolCalls: [], finishReason: "stop", usage: {} }
          };
        }
      }
    };
    const socket = await setup(workspace, provider);
    await socket.next();

    socket.clientSend({ type: "user_message", text: "run command" });
    expect(await socket.next()).toEqual({ type: "tool_call", id: "call_1", name: "exec", arguments: { command: "echo approved" } });
    const approval = await socket.next();
    expect(approval.type).toBe("approve_request");
    if (approval.type === "approve_request") {
      socket.clientSend({ type: "approve_command", id: approval.id, approved: true });
    }
    const result = await socket.next();
    expect(result.type).toBe("tool_result");
    expect(result.type === "tool_result" && result.content).toContain("approved");
  });
});
