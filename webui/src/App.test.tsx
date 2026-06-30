import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import App from "./App";

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

describe("App", () => {
  afterEach(() => {
    FakeWebSocket.instances = [];
    localStorage.clear();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("renders the main workspace regions from app state", async () => {
    vi.stubGlobal("WebSocket", FakeWebSocket);
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const path = String(input);

        if (path === "/api/sessions") {
          return new Response(JSON.stringify([]), { status: 200 });
        }

        if (path.startsWith("/api/sessions/")) {
          return new Response(
            JSON.stringify({
              key: "default",
              messages: [],
              createdAt: "",
              updatedAt: "",
              metadata: {}
            }),
            { status: 200 }
          );
        }

        if (path.startsWith("/api/files/tree")) {
          return new Response(
            JSON.stringify({
              name: ".",
              path: ".",
              type: "directory",
              children: []
            }),
            { status: 200 }
          );
        }

        return new Response(JSON.stringify({}), { status: 200 });
      })
    );

    render(<App />);

    // Sidebar tabs: "Files" and "Changes" tabs are present
    expect(await screen.findByText("Files")).toBeInTheDocument();
    expect(screen.getByText("Changes")).toBeInTheDocument();
    // New session icon button is present
    expect(screen.getByRole("button", { name: "New session" })).toBeInTheDocument();
  });

  it("refreshes the active session after a completed turn so history appears", async () => {
    vi.stubGlobal("WebSocket", FakeWebSocket);
    let sessionRequestCount = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const path = String(input);

        if (path === "/api/sessions") {
          return new Response(JSON.stringify([]), { status: 200 });
        }

        if (path === "/api/sessions/default") {
          sessionRequestCount += 1;
          return new Response(
            JSON.stringify({
              key: "default",
              messages:
                sessionRequestCount === 1
                  ? []
                  : [
                      {
                        role: "user",
                        content: "historical user prompt",
                        timestamp: "2026-06-21T00:00:00.000Z"
                      },
                      {
                        role: "assistant",
                        content: "historical assistant answer",
                        timestamp: "2026-06-21T00:00:01.000Z"
                      }
                    ],
              createdAt: "",
              updatedAt: "",
              metadata: {}
            }),
            { status: 200 }
          );
        }

        if (path.startsWith("/api/files/tree")) {
          return new Response(JSON.stringify({ name: ".", path: ".", type: "directory", children: [] }), {
            status: 200
          });
        }

        return new Response(JSON.stringify({}), { status: 200 });
      })
    );

    render(<App />);

    await screen.findByText("Files");
    FakeWebSocket.instances[0]?.emit("message", {
      data: JSON.stringify({
        type: "done",
        result: {
          finalContent: "historical assistant answer",
          messages: [],
          toolsUsed: [],
          usage: {},
          stopReason: "completed",
          toolEvents: []
        }
      })
    });

    expect(await screen.findByText("historical user prompt")).toBeInTheDocument();
    expect(screen.getAllByText("historical assistant answer").length).toBeGreaterThan(0);
  });

  it("loads history for a selected non-default session", async () => {
    vi.stubGlobal("WebSocket", FakeWebSocket);
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const path = String(input);

        if (path === "/api/sessions") {
          return new Response(
            JSON.stringify([
              { key: "default", createdAt: "", updatedAt: "", messageCount: 0, preview: "" },
              { key: "other", createdAt: "", updatedAt: "", messageCount: 2, preview: "other prompt" }
            ]),
            { status: 200 }
          );
        }

        if (path === "/api/sessions/other") {
          return new Response(
            JSON.stringify({
              key: "other",
              messages: [
                { role: "user", content: "other prompt", timestamp: "2026-06-21T00:00:00.000Z" },
                { role: "assistant", content: "other answer", timestamp: "2026-06-21T00:00:01.000Z" }
              ],
              createdAt: "",
              updatedAt: "",
              metadata: {}
            }),
            { status: 200 }
          );
        }

        if (path === "/api/sessions/default") {
          return new Response(
            JSON.stringify({ key: "default", messages: [], createdAt: "", updatedAt: "", metadata: {} }),
            { status: 200 }
          );
        }

        if (path.startsWith("/api/files/tree")) {
          return new Response(JSON.stringify({ name: ".", path: ".", type: "directory", children: [] }), {
            status: 200
          });
        }

        return new Response(JSON.stringify({}), { status: 200 });
      })
    );

    render(<App />);

    await userEvent.click(await screen.findByRole("button", { name: /other/ }));

    expect(await screen.findByText("other answer")).toBeInTheDocument();
    expect(screen.getAllByText("other prompt").length).toBeGreaterThan(0);
  });
});
