import { Readable, Writable } from "node:stream";

import { describe, expect, it } from "vitest";

import { HttpRouter, json } from "../../src/server/httpRouter.js";

function request(method: string, url: string): Parameters<HttpRouter["handle"]>[0] {
  const req = Readable.from([]);
  Object.assign(req, { method, url, headers: {} });
  return req as Parameters<HttpRouter["handle"]>[0];
}

function response(): Parameters<HttpRouter["handle"]>[1] & { body: () => string; status: () => number | undefined } {
  let body = "";
  const res = new Writable({
    write(chunk, _encoding, callback) {
      body += chunk.toString();
      callback();
    }
  }) as Parameters<HttpRouter["handle"]>[1] & { statusCode?: number; body: () => string; status: () => number | undefined };
  res.setHeader = () => res;
  res.getHeader = () => undefined;
  res.removeHeader = () => undefined;
  res.writeHead = (statusCode: number) => {
    res.statusCode = statusCode;
    return res;
  };
  res.end = (chunk?: unknown) => {
    if (chunk) {
      body += String(chunk);
    }
    return res;
  };
  res.body = () => body;
  res.status = () => res.statusCode;
  return res;
}

describe("HttpRouter", () => {
  it("matches method and parameterized paths", async () => {
    const router = new HttpRouter();
    router.add("GET", "/api/sessions/:key", async (_req, res, params) => {
      await json(res, { key: params.key });
    });

    const res = response();
    const handled = await router.handle(request("GET", "/api/sessions/demo?ignored=1"), res);

    expect(handled).toBe(true);
    expect(res.status()).toBe(200);
    expect(JSON.parse(res.body())).toEqual({ key: "demo" });
  });

  it("returns a JSON 404 for unmatched api routes", async () => {
    const router = new HttpRouter();
    const res = response();

    const handled = await router.handle(request("GET", "/api/missing"), res);

    expect(handled).toBe(true);
    expect(res.status()).toBe(404);
    expect(JSON.parse(res.body())).toEqual({ error: "Not found" });
  });
});
