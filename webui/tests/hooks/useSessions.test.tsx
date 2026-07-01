import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Session, SessionSummary } from "@/api/types";
import { useSessions } from "@/hooks/useSessions";

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });
}

function sessionSummary(key: string): SessionSummary {
  return {
    key,
    createdAt: "",
    updatedAt: "",
    messageCount: 1,
    preview: `${key} preview`
  };
}

function session(key: string): Session {
  return {
    key,
    messages: [],
    createdAt: "",
    updatedAt: "",
    metadata: {}
  };
}

function deferred<T>(): {
  promise: Promise<T>;
  resolve(value: T): void;
} {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((innerResolve) => {
    resolve = innerResolve;
  });
  return { promise, resolve };
}

describe("useSessions", () => {
  it("loads session summaries and the default active session", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const path = String(input);
      if (path === "/api/sessions") {
        return jsonResponse([sessionSummary("default")]);
      }
      return jsonResponse(session("default"));
    });
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useSessions("default"));

    await waitFor(() => expect(result.current.sessions[0]?.key).toBe("default"));
    await act(async () => {
      await result.current.loadSession("default");
    });
    await waitFor(() => expect(result.current.activeSession?.key).toBe("default"));
    expect(fetchMock).toHaveBeenCalledWith("/api/sessions/default", expect.objectContaining({ method: "GET" }));
  });

  it("loads the last active session from local storage on refresh", async () => {
    localStorage.setItem("mini-agent.activeSessionKey", "other");
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const path = String(input);
      if (path === "/api/sessions") {
        return jsonResponse([sessionSummary("default"), sessionSummary("other")]);
      }
      return jsonResponse(session(path.endsWith("/other") ? "other" : "default"));
    });
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useSessions("default"));

    // activeKey is initialised from localStorage, but session data requires explicit load.
    expect(result.current.activeKey).toBe("other");
    await act(async () => {
      await result.current.loadSession("other");
    });
    await waitFor(() => expect(result.current.activeSession?.key).toBe("other"));
    expect(fetchMock).toHaveBeenCalledWith("/api/sessions/other", expect.objectContaining({ method: "GET" }));
  });

  it("persists the selected session key", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const path = String(input);
      if (path === "/api/sessions") {
        return jsonResponse([sessionSummary("default"), sessionSummary("other")]);
      }
      return jsonResponse(session(path.endsWith("/other") ? "other" : "default"));
    });
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useSessions("default"));

    await act(async () => {
      await result.current.loadSession("default");
    });
    await waitFor(() => expect(result.current.activeSession?.key).toBe("default"));

    await act(async () => {
      await result.current.loadSession("other");
    });

    expect(localStorage.getItem("mini-agent.activeSessionKey")).toBe("other");
  });

  it("keeps the newest selected session when older requests resolve later", async () => {
    const defaultRequest = deferred<Response>();
    const firstRequest = deferred<Response>();
    const secondRequest = deferred<Response>();
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const path = String(input);
      if (path === "/api/sessions") {
        return Promise.resolve(jsonResponse([sessionSummary("default"), sessionSummary("first"), sessionSummary("second")]));
      }
      if (path === "/api/sessions/default") {
        return defaultRequest.promise;
      }
      if (path === "/api/sessions/first") {
        return firstRequest.promise;
      }
      if (path === "/api/sessions/second") {
        return secondRequest.promise;
      }
      return Promise.reject(new Error(`Unexpected path ${path}`));
    });
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useSessions("default"));
    await waitFor(() => expect(result.current.sessions).toHaveLength(3));

    let firstLoad!: Promise<boolean>;
    let secondLoad!: Promise<boolean>;
    act(() => {
      firstLoad = result.current.loadSession("first");
      secondLoad = result.current.loadSession("second");
    });

    await act(async () => {
      secondRequest.resolve(jsonResponse(session("second")));
      await secondRequest.promise;
      await secondLoad;
    });
    await waitFor(() => expect(result.current.activeSession?.key).toBe("second"));

    await act(async () => {
      defaultRequest.resolve(jsonResponse(session("default")));
      firstRequest.resolve(jsonResponse(session("first")));
      await Promise.all([defaultRequest.promise, firstRequest.promise]);
      await firstLoad;
    });

    expect(result.current.activeKey).toBe("second");
    expect(result.current.activeSession?.key).toBe("second");
  });

  it("deletes sessions and reloads the default when deleting the active session", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      if (init?.method === "DELETE") {
        return new Response(null, { status: 204 });
      }
      if (path === "/api/sessions") {
        return jsonResponse([sessionSummary("default")]);
      }
      if (path === "/api/sessions/other") {
        return jsonResponse(session("other"));
      }
      return jsonResponse(session("default"));
    });
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useSessions("default"));

    await act(async () => {
      await result.current.loadSession("default");
    });
    await waitFor(() => expect(result.current.activeSession?.key).toBe("default"));

    await act(async () => {
      await result.current.loadSession("other");
    });
    await waitFor(() => expect(result.current.activeSession?.key).toBe("other"));

    await act(async () => {
      await result.current.deleteSession("other");
    });

    expect(fetchMock).toHaveBeenCalledWith("/api/sessions/other", expect.objectContaining({ method: "DELETE" }));
    await waitFor(() => expect(result.current.activeSession?.key).toBe("default"));
  });
});
