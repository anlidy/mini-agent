import { afterEach, describe, expect, it, vi } from "vitest";

import { createAgentSocket } from "./ws";

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];

  readonly listeners = new Map<string, Array<(event: unknown) => void>>();
  readonly send = vi.fn();
  readonly close = vi.fn();

  constructor(readonly url: string) {
    FakeWebSocket.instances.push(this);
  }

  addEventListener(type: string, listener: (event: unknown) => void): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }

  emit(type: string, event: unknown = {}): void {
    for (const listener of this.listeners.get(type) ?? []) {
      listener(event);
    }
  }
}

afterEach(() => {
  FakeWebSocket.instances = [];
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function stubLocation(url: string) {
  const parsed = new URL(url);
  vi.stubGlobal("location", {
    protocol: parsed.protocol,
    host: parsed.host
  });
}

describe("createAgentSocket", () => {
  it("connects to the current host with encoded session key", () => {
    vi.stubGlobal("WebSocket", FakeWebSocket);
    stubLocation("http://127.0.0.1:5173/");

    createAgentSocket("default session", { onMessage: vi.fn() });

    expect(FakeWebSocket.instances[0]?.url).toBe("ws://127.0.0.1:5173/ws?session=default%20session");
  });

  it("uses secure WebSocket protocol on HTTPS pages", () => {
    vi.stubGlobal("WebSocket", FakeWebSocket);
    stubLocation("https://mini-agent.test/workspace");

    createAgentSocket("default", { onMessage: vi.fn() });

    expect(FakeWebSocket.instances[0]?.url).toBe("wss://mini-agent.test/ws?session=default");
  });

  it("serializes client messages before sending", () => {
    vi.stubGlobal("WebSocket", FakeWebSocket);
    const socket = createAgentSocket("default", { onMessage: vi.fn() });

    socket.send({ type: "approve_command", id: "approval-1", approved: true });

    expect(FakeWebSocket.instances[0]?.send).toHaveBeenCalledWith(
      JSON.stringify({ type: "approve_command", id: "approval-1", approved: true })
    );
  });

  it("dispatches parsed server messages", () => {
    vi.stubGlobal("WebSocket", FakeWebSocket);
    const onMessage = vi.fn();
    createAgentSocket("default", { onMessage });

    FakeWebSocket.instances[0]?.emit("message", {
      data: JSON.stringify({ type: "token", text: "hello" })
    });

    expect(onMessage).toHaveBeenCalledWith({ type: "token", text: "hello" });
  });

  it("forwards lifecycle events", () => {
    vi.stubGlobal("WebSocket", FakeWebSocket);
    const onOpen = vi.fn();
    const onClose = vi.fn();
    const onError = vi.fn();
    createAgentSocket("default", { onMessage: vi.fn(), onOpen, onClose, onError });
    const errorEvent = new Event("error");

    FakeWebSocket.instances[0]?.emit("open");
    FakeWebSocket.instances[0]?.emit("close");
    FakeWebSocket.instances[0]?.emit("error", errorEvent);

    expect(onOpen).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
    expect(onError).toHaveBeenCalledWith(errorEvent);
  });

  it("closes the underlying socket", () => {
    vi.stubGlobal("WebSocket", FakeWebSocket);
    const socket = createAgentSocket("default", { onMessage: vi.fn() });

    socket.close();

    expect(FakeWebSocket.instances[0]?.close).toHaveBeenCalledOnce();
  });
});
