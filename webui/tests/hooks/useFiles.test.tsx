import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { FileContent, FileTreeNode } from "@/api/types";
import { useFiles } from "@/hooks/useFiles";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });
}

function tree(children: FileTreeNode[]): FileTreeNode {
  return {
    name: ".",
    path: ".",
    type: "directory",
    children
  };
}

function file(path: string): FileContent {
  return {
    path,
    content: `${path} content`
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

describe("useFiles", () => {
  it("loads the workspace tree", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse(tree([{ name: "README.md", path: "README.md", type: "file" }])))
    );

    const { result } = renderHook(() => useFiles());

    await waitFor(() => expect(result.current.tree?.children?.[0]?.path).toBe("README.md"));
  });

  it("loads selected file content with an encoded path", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const path = String(input);
      if (path === "/api/sessions/default/files/tree?path=.") {
        return jsonResponse(tree([]));
      }
      return jsonResponse(file("docs/space file.md"));
    });
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useFiles());
    await waitFor(() => expect(result.current.tree).toBeDefined());

    await act(async () => {
      await result.current.selectFile("docs/space file.md");
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/sessions/default/files/content?path=docs%2Fspace%20file.md",
      expect.objectContaining({ method: "GET" })
    );
    expect(result.current.selected?.path).toBe("docs/space file.md");
  });

  it("keeps the newest selected file when older requests resolve later", async () => {
    const firstRequest = deferred<Response>();
    const secondRequest = deferred<Response>();
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        const path = String(input);
        if (path === "/api/sessions/default/files/tree?path=.") {
          return Promise.resolve(jsonResponse(tree([])));
        }
        if (path === "/api/sessions/default/files/content?path=first.txt") {
          return firstRequest.promise;
        }
        if (path === "/api/sessions/default/files/content?path=second.txt") {
          return secondRequest.promise;
        }
        return Promise.reject(new Error(`Unexpected path ${path}`));
      })
    );
    const { result } = renderHook(() => useFiles());
    await waitFor(() => expect(result.current.tree).toBeDefined());

    let firstSelect!: Promise<void>;
    let secondSelect!: Promise<void>;
    act(() => {
      firstSelect = result.current.selectFile("first.txt");
      secondSelect = result.current.selectFile("second.txt");
    });

    await act(async () => {
      secondRequest.resolve(jsonResponse(file("second.txt")));
      await secondRequest.promise;
      await secondSelect;
    });
    await waitFor(() => expect(result.current.selected?.path).toBe("second.txt"));

    await act(async () => {
      firstRequest.resolve(jsonResponse(file("first.txt")));
      await firstRequest.promise;
      await firstSelect;
    });

    expect(result.current.selected?.path).toBe("second.txt");
  });

  it("invalidates an in-flight file request when the session changes", async () => {
    const oldRequest = deferred<Response>();
    let oldSignal: AbortSignal | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const requestPath = String(input);
        if (requestPath.includes("/files/tree")) {
          return Promise.resolve(jsonResponse(tree([])));
        }
        if (requestPath === "/api/sessions/old/files/content?path=old.txt") {
          oldSignal = init?.signal ?? undefined;
          return oldRequest.promise;
        }
        return Promise.reject(new Error(`Unexpected path ${requestPath}`));
      })
    );
    const { result, rerender } = renderHook(
      ({ sessionKey }) => useFiles(sessionKey, 1),
      { initialProps: { sessionKey: "old" } }
    );
    await waitFor(() => expect(result.current.tree).toBeDefined());

    let selection!: Promise<void>;
    act(() => {
      selection = result.current.selectFile("old.txt");
    });
    rerender({ sessionKey: "new" });
    await waitFor(() => expect(oldSignal?.aborted).toBe(true));

    await act(async () => {
      oldRequest.resolve(jsonResponse(file("old.txt")));
      await selection;
    });
    expect(result.current.selected).toBeUndefined();
  });
});
