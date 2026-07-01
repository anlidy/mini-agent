import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useConfig } from "@/hooks/useConfig";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });
}

function configBody() {
  return {
    workspace: ".",
    provider: { name: "deepseek", model: "deepseek-chat" },
    agent: { maxIterations: 10, maxToolResultChars: 12000 },
    sessions: { dir: ".mini-agent/sessions", defaultKey: "default", maxHistoryMessages: 100, maxHistoryChars: 200000 },
    search: { backend: "none", maxResults: 5 },
    exec: { enabled: false, timeoutMs: 30000, maxOutputChars: 32000 }
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("useConfig", () => {
  it("loads config and tools on mount", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const path = String(input);
        if (path === "/api/config") return jsonResponse(configBody());
        if (path === "/api/tools") {
          return jsonResponse([{ type: "function", function: { name: "read_file", description: "", parameters: {} } }]);
        }
        return jsonResponse({});
      })
    );

    const { result } = renderHook(() => useConfig());

    await waitFor(() => expect(result.current.config).toBeDefined());
    expect(result.current.config?.provider.name).toBe("deepseek");
    expect(result.current.tools).toHaveLength(1);
    expect(result.current.tools[0]!.function.name).toBe("read_file");
  });

  it("saves config patch via PUT", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      if (path === "/api/config" && init?.method === "PUT") {
        return jsonResponse({ ...configBody(), provider: { ...configBody().provider, model: "new-model" } });
      }
      if (path === "/api/config") return jsonResponse(configBody());
      if (path === "/api/tools") return jsonResponse([]);
      return jsonResponse({});
    });
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useConfig());
    await waitFor(() => expect(result.current.config).toBeDefined());

    let ok = false;
    await act(async () => {
      ok = await result.current.save({ provider: { model: "new-model" } });
    });

    expect(ok).toBe(true);
    expect(result.current.config?.provider.model).toBe("new-model");
  });

  it("handles fetch errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ error: "server down" }), {
        status: 500,
        headers: { "content-type": "application/json" }
      }))
    );

    const { result } = renderHook(() => useConfig());

    await waitFor(() => expect(result.current.error).toBeDefined());
    expect(result.current.error).toContain("server down");
  });
});
