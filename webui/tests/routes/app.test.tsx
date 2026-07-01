import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import ChatPage from "@/routes/ChatPage";
import RootLayout from "@/routes/RootLayout";
import SettingsPage from "@/routes/SettingsPage";

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

function createTestRouter(initialRoute = "/chat/default") {
  return createMemoryRouter(
    [
      {
        element: <RootLayout />,
        children: [
          { index: true, path: "/", element: <ChatPage /> },
          { path: "chat/:sessionId", element: <ChatPage /> },
          { path: "settings", element: <SettingsPage /> }
        ]
      }
    ],
    { initialEntries: [initialRoute] }
  );
}

describe("App (with router)", () => {
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

    render(<RouterProvider router={createTestRouter()} />);

    // Sidebar tabs: "Files" and "Changes" tabs are present
    expect(await screen.findByText("Files")).toBeInTheDocument();
    expect(screen.getByText("Changes")).toBeInTheDocument();
    // New session and settings icon buttons are present
    expect(screen.getByRole("button", { name: "New session" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Settings" })).toBeInTheDocument();
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

    render(<RouterProvider router={createTestRouter()} />);

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

    render(<RouterProvider router={createTestRouter()} />);

    await userEvent.click(await screen.findByRole("button", { name: /other/ }));

    expect(await screen.findByText("other answer")).toBeInTheDocument();
    expect(screen.getAllByText("other prompt").length).toBeGreaterThan(0);
  });

  it("navigates to settings page", async () => {
    vi.stubGlobal("WebSocket", FakeWebSocket);
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const path = String(input);
        if (path === "/api/sessions") return new Response(JSON.stringify([]), { status: 200 });
        if (path.startsWith("/api/sessions/")) {
          return new Response(
            JSON.stringify({ key: "default", messages: [], createdAt: "", updatedAt: "", metadata: {} }),
            { status: 200 }
          );
        }
        if (path.startsWith("/api/files/tree")) {
          return new Response(JSON.stringify({ name: ".", path: ".", type: "directory", children: [] }), { status: 200 });
        }
        if (path === "/api/config") {
          return new Response(
            JSON.stringify({
              workspace: ".",
              provider: { name: "deepseek", baseUrl: "https://api.deepseek.com/v1", model: "deepseek-chat" },
              agent: { maxIterations: 10, maxToolResultChars: 12000 },
              sessions: { dir: ".mini-agent/sessions", defaultKey: "default", maxHistoryMessages: 100, maxHistoryChars: 200000 },
              search: { backend: "none", maxResults: 5 },
              exec: { enabled: false, timeoutMs: 30000, maxOutputChars: 32000 }
            }),
            { status: 200 }
          );
        }
        if (path === "/api/tools") return new Response(JSON.stringify([]), { status: 200 });
        return new Response(JSON.stringify({}), { status: 200 });
      })
    );

    render(<RouterProvider router={createTestRouter()} />);

    await userEvent.click(await screen.findByRole("button", { name: "Settings" }));

    // Settings page should be visible
    expect(await screen.findByText("Provider")).toBeInTheDocument();
    expect(screen.getByText("Agent")).toBeInTheDocument();
    expect(screen.getByText("Tools")).toBeInTheDocument();
  });
});
