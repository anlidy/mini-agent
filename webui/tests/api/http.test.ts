import { afterEach, describe, expect, it, vi } from "vitest";

import { apiDelete, apiGet, apiPut } from "@/api/http";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("http api helpers", () => {
  it("parses JSON responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" }
      }))
    );

    await expect(apiGet<{ ok: boolean }>("/api/test")).resolves.toEqual({ ok: true });
  });

  it("throws backend error messages", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ error: "bad config" }), {
        status: 400,
        headers: { "content-type": "application/json" }
      }))
    );

    await expect(apiGet("/api/config")).rejects.toThrow("bad config");
  });

  it("sends PUT bodies as JSON", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ saved: true }), {
      status: 200,
      headers: { "content-type": "application/json" }
    }));
    vi.stubGlobal("fetch", fetchMock);

    await apiPut("/api/config", { provider: { model: "x" } });

    expect(fetchMock).toHaveBeenCalledWith("/api/config", expect.objectContaining({
      method: "PUT",
      body: JSON.stringify({ provider: { model: "x" } })
    }));
  });

  it("handles 204 delete responses", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 204 })));

    await expect(apiDelete("/api/sessions/demo")).resolves.toBeUndefined();
  });

  it("handles empty successful responses", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 200 })));

    await expect(apiGet<void>("/api/empty")).resolves.toBeUndefined();
  });

  it("throws a clear error for invalid JSON responses", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("not json", { status: 200 })));

    await expect(apiGet("/api/bad-json")).rejects.toThrow("Invalid JSON response from /api/bad-json");
  });
});
