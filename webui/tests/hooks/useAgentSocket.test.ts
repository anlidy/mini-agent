import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useAgentSocket } from "@/hooks/useAgentSocket";

/* ------------------------------------------------------------------ */
/*  Fake WebSocket                                                     */
/* ------------------------------------------------------------------ */

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];

  readonly listeners = new Map<string, Array<(event: unknown) => void>>();
  send = vi.fn();
  close = vi.fn();

  constructor() {
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

function messageEvent(data: unknown) {
  return { data: JSON.stringify(data) };
}

afterEach(() => {
  FakeWebSocket.instances = [];
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe("useAgentSocket", () => {
  it("connects on mount and sets connected state", async () => {
    vi.stubGlobal("WebSocket", FakeWebSocket);
    const { result } = renderHook(() => useAgentSocket("default"));

    await act(async () => {
      FakeWebSocket.instances[0]?.emit("open");
    });

    await waitFor(() => expect(result.current.connected).toBe(true));
  });

  it("send() rejects when not connected", () => {
    vi.stubGlobal("WebSocket", FakeWebSocket);
    const { result } = renderHook(() => useAgentSocket("default"));

    let ok = false;
    act(() => {
      ok = result.current.send("hello");
    });

    expect(ok).toBe(false);
    expect(result.current.error).toBe("WebSocket is not connected.");
  });

  it("send() transmits user_message and sets active state", async () => {
    vi.stubGlobal("WebSocket", FakeWebSocket);
    const { result } = renderHook(() => useAgentSocket("default"));

    await act(async () => {
      FakeWebSocket.instances[0]?.emit("open");
    });
    await waitFor(() => expect(result.current.connected).toBe(true));

    let ok = false;
    act(() => {
      ok = result.current.send("hello world");
    });

    expect(ok).toBe(true);
    expect(result.current.active).toBe(true);
    expect(FakeWebSocket.instances[0]?.send).toHaveBeenCalledWith(
      JSON.stringify({ type: "user_message", text: "hello world" })
    );
  });

  it("accumulates token messages as text segments", async () => {
    vi.stubGlobal("WebSocket", FakeWebSocket);
    const { result } = renderHook(() => useAgentSocket("default"));

    await act(async () => {
      FakeWebSocket.instances[0]?.emit("open");
      FakeWebSocket.instances[0]?.emit("message", messageEvent({ type: "token", text: "Hello " }));
      FakeWebSocket.instances[0]?.emit("message", messageEvent({ type: "token", text: "world" }));
    });

    await waitFor(() => expect(result.current.segments).toHaveLength(1));
    expect(result.current.segments[0]!.kind).toBe("text");
    if (result.current.segments[0]!.kind === "text") {
      expect(result.current.segments[0]!.content).toBe("Hello world");
    }
  });

  it("handles tool_call and tool_result lifecycle", async () => {
    vi.stubGlobal("WebSocket", FakeWebSocket);
    const { result } = renderHook(() => useAgentSocket("default"));

    await act(async () => {
      FakeWebSocket.instances[0]?.emit("open");
      FakeWebSocket.instances[0]?.emit("message", messageEvent({
        type: "tool_call", id: "t1", name: "read_file", arguments: { path: "x.ts" }
      }));
    });

    await waitFor(() => expect(result.current.segments).toHaveLength(1));
    expect(result.current.segments[0]!.kind).toBe("tool");

    await act(async () => {
      FakeWebSocket.instances[0]?.emit("message", messageEvent({
        type: "tool_result", id: "t1", name: "read_file", status: "ok", content: "file contents"
      }));
    });

    await waitFor(() => {
      const seg = result.current.segments[0];
      return seg?.kind === "tool" && seg.step.status === "ok";
    });
  });

  it("handles approval request flow", async () => {
    vi.stubGlobal("WebSocket", FakeWebSocket);
    const { result } = renderHook(() => useAgentSocket("default"));

    await act(async () => {
      FakeWebSocket.instances[0]?.emit("open");
      FakeWebSocket.instances[0]?.emit("message", messageEvent({
        type: "approve_request", id: "a1", command: "rm -rf /"
      }));
    });

    await waitFor(() => expect(result.current.approval).toBeDefined());
    expect(result.current.approval?.command).toBe("rm -rf /");

    act(() => {
      result.current.resolveApproval(true);
    });

    expect(FakeWebSocket.instances[0]?.send).toHaveBeenCalledWith(
      JSON.stringify({ type: "approve_command", id: "a1", approved: true })
    );
    expect(result.current.approval?.resolved).toBe("approved");
  });

  it("cleans up on sessionKey change", async () => {
    vi.stubGlobal("WebSocket", FakeWebSocket);
    const { rerender } = renderHook(
      ({ key }) => useAgentSocket(key),
      { initialProps: { key: "session-1" } }
    );

    await act(async () => {
      FakeWebSocket.instances[0]?.emit("open");
    });

    const firstSocket = FakeWebSocket.instances[0]!;

    rerender({ key: "session-2" });

    // Old socket should be closed
    expect(firstSocket.close).toHaveBeenCalled();
  });

  it("aborts active turn", async () => {
    vi.stubGlobal("WebSocket", FakeWebSocket);
    const { result } = renderHook(() => useAgentSocket("default"));

    await act(async () => {
      FakeWebSocket.instances[0]?.emit("open");
    });
    await waitFor(() => expect(result.current.connected).toBe(true));

    act(() => {
      result.current.send("hello");
    });

    act(() => {
      result.current.abort();
    });

    expect(FakeWebSocket.instances[0]?.send).toHaveBeenCalledWith(
      JSON.stringify({ type: "abort" })
    );
    expect(result.current.aborting).toBe(true);
  });

  it("handles done message and calls onDone callback", async () => {
    vi.stubGlobal("WebSocket", FakeWebSocket);
    const onDone = vi.fn();
    const { result } = renderHook(() => useAgentSocket("default", { onDone }));

    await act(async () => {
      FakeWebSocket.instances[0]?.emit("open");
      result.current.send("hello");
      FakeWebSocket.instances[0]?.emit("message", messageEvent({
        type: "done",
        result: { finalContent: "done", messages: [], toolsUsed: [], usage: {}, stopReason: "completed", toolEvents: [] }
      }));
    });

    await waitFor(() => expect(result.current.active).toBe(false));
    expect(onDone).toHaveBeenCalledOnce();
  });

  it("handles error message", async () => {
    vi.stubGlobal("WebSocket", FakeWebSocket);
    const { result } = renderHook(() => useAgentSocket("default"));

    await act(async () => {
      FakeWebSocket.instances[0]?.emit("open");
      FakeWebSocket.instances[0]?.emit("message", messageEvent({
        type: "error", error: "something went wrong"
      }));
    });

    await waitFor(() => expect(result.current.error).toBe("something went wrong"));
    expect(result.current.active).toBe(false);
  });
});
