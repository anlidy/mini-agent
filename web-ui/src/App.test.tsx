import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import App from "./App";

class FakeWebSocket {
  addEventListener = vi.fn();
  send = vi.fn();
  close = vi.fn();
}

describe("App", () => {
  afterEach(() => {
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

    expect(screen.getAllByText("mini-agent").length).toBeGreaterThan(0);
    expect(await screen.findByText("Sessions")).toBeInTheDocument();
    expect(screen.getByText("Files")).toBeInTheDocument();
  });
});
