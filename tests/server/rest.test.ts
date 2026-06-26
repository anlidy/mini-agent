import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import type { IncomingMessage, OutgoingHttpHeaders, ServerResponse } from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Readable, Writable } from "node:stream";

import { describe, expect, it } from "vitest";

import { defaultConfig, REDACTED_API_KEY } from "../../src/config/loadConfig.js";
import { createRequestHandler, type MiniAgentRequestHandler } from "../../src/server/index.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

async function setup(workspace: string): Promise<MiniAgentRequestHandler> {
  const config = defaultConfig(workspace);
  config.provider.apiKey = "secret-key";
  config.exec = { enabled: true, timeoutMs: 1000, maxOutputChars: 2000 };
  await mkdir(path.join(workspace, ".mini-agent"), { recursive: true });
  await writeFile(path.join(workspace, ".mini-agent", "config.json"), `${JSON.stringify(config, null, 2)}\n`, "utf8");
  return createRequestHandler({ workspace });
}

async function call(
  handler: MiniAgentRequestHandler,
  method: string,
  url: string,
  body?: unknown
): Promise<{ status: number; body: string; headers: Record<string, string>; json: unknown }> {
  const reqBody = body === undefined ? "" : JSON.stringify(body);
  const req = Readable.from(reqBody ? [reqBody] : []) as IncomingMessage;
  Object.assign(req, {
    method,
    url,
    headers: reqBody ? { "content-type": "application/json", "content-length": Buffer.byteLength(reqBody) } : {}
  });

  let responseBody = "";
  const headers: Record<string, string> = {};
  const res = new Writable({
    write(chunk, _encoding, callback) {
      responseBody += chunk.toString();
      callback();
    }
  }) as ServerResponse & { statusCode: number };
  res.statusCode = 200;
  res.setHeader = (name: string, value: number | string | readonly string[]) => {
    headers[name.toLowerCase()] = Array.isArray(value) ? value.join(", ") : String(value);
    return res;
  };
  res.getHeader = (name: string) => headers[name.toLowerCase()];
  res.removeHeader = () => undefined;
  res.writeHead = ((
    statusCode: number,
    statusMessageOrHeaders?: string | OutgoingHttpHeaders,
    maybeHeaders?: OutgoingHttpHeaders
  ) => {
    res.statusCode = statusCode;
    const outgoingHeaders = typeof statusMessageOrHeaders === "string" ? maybeHeaders : statusMessageOrHeaders;
    if (outgoingHeaders) {
      for (const [name, value] of Object.entries(outgoingHeaders)) {
        if (value !== undefined) {
          headers[name.toLowerCase()] = Array.isArray(value) ? value.join(", ") : String(value);
        }
      }
    }
    return res;
  }) as ServerResponse["writeHead"];
  res.end = (chunk?: unknown) => {
    if (chunk) {
      responseBody += String(chunk);
    }
    return res;
  };

  await handler.handle(req, res);
  return {
    status: res.statusCode,
    body: responseBody,
    headers,
    json: responseBody ? JSON.parse(responseBody) as unknown : undefined
  };
}

describe("server REST API", () => {
  it("lists, reads, and deletes sessions", async () => {
    const workspace = await mkdtemp(path.join(os.tmpdir(), "mini-agent-rest-sessions-"));
    const handler = await setup(workspace);
    const sessionPath = path.join(workspace, ".mini-agent", "workspace", "sessions", "demo.jsonl");
    await mkdir(path.dirname(sessionPath), { recursive: true });
    await writeFile(sessionPath, `${JSON.stringify({ role: "user", content: "hello", timestamp: "2026-06-04T00:00:00.000Z" })}\n`, "utf8");

    const list = await call(handler, "GET", "/api/sessions");
    expect(list.json).toMatchObject([{ key: "demo", messageCount: 1, preview: "hello" }]);

    const full = await call(handler, "GET", "/api/sessions/demo");
    expect((full.json as { messages: unknown[] }).messages).toMatchObject([{ role: "user", content: "hello" }]);

    const deleted = await call(handler, "DELETE", "/api/sessions/demo");
    expect(deleted.status).toBe(204);
    expect((await call(handler, "GET", "/api/sessions")).json).toEqual([]);
  });

  it("redacts config API keys and preserves them through PUT", async () => {
    const workspace = await mkdtemp(path.join(os.tmpdir(), "mini-agent-rest-config-"));
    const handler = await setup(workspace);

    const config = (await call(handler, "GET", "/api/config")).json as { provider: { apiKey: string; model: string }; agent: { maxIterations: number } };
    expect(config.provider.apiKey).toBe(REDACTED_API_KEY);

    const put = await call(handler, "PUT", "/api/config", {
      provider: { ...config.provider, model: "rest-model" },
      agent: { ...config.agent, maxIterations: 5 }
    });
    expect(put.status).toBe(200);
    const updated = put.json as { provider: { apiKey: string; model: string } };
    expect(updated.provider.apiKey).toBe(REDACTED_API_KEY);
    expect(updated.provider.model).toBe("rest-model");

    const raw = await readFile(path.join(workspace, ".mini-agent", "config.json"), "utf8");
    expect(raw).toContain("secret-key");
    expect(raw).toContain("rest-model");
  });

  it("serves tool definitions and read-only workspace files while rejecting escapes", async () => {
    const workspace = await mkdtemp(path.join(os.tmpdir(), "mini-agent-rest-files-"));
    await writeFile(path.join(workspace, "README.md"), "read me", "utf8");
    const handler = await setup(workspace);

    const tools = (await call(handler, "GET", "/api/tools")).json as Array<{ function?: { name?: string } }>;
    expect(tools.some((definition) => definition.function?.name === "read_file")).toBe(true);
    expect(tools.some((definition) => definition.function?.name === "exec")).toBe(true);

    const tree = (await call(handler, "GET", "/api/files/tree?path=.")).json as { children: Array<{ name: string }> };
    expect(tree.children.some((entry) => entry.name === "README.md")).toBe(true);

    const content = await call(handler, "GET", "/api/files/content?path=README.md");
    expect(content.json).toEqual({ path: "README.md", content: "read me" });

    const escaped = await call(handler, "GET", "/api/files/content?path=../outside");
    expect(escaped.status).toBe(403);
    expect(escaped.json).toEqual({ error: "Path escapes workspace: ../outside" });
  });

  it("serves the default frontend build outside the selected workspace", async () => {
    const workspace = await mkdtemp(path.join(os.tmpdir(), "mini-agent-rest-static-workspace-"));
    const staticRoot = path.join(repoRoot, "dist", "webui");
    const indexPath = path.join(staticRoot, "index.html");
    const previousIndex = await readFile(indexPath, "utf8").catch(() => undefined);
    await mkdir(staticRoot, { recursive: true });
    await writeFile(indexPath, "<main>webui shell</main>", "utf8");

    try {
      const handler = await setup(workspace);
      const response = await call(handler, "GET", "/");

      expect(response.status).toBe(200);
      expect(response.headers["content-length"]).toBe(String(Buffer.byteLength("<main>webui shell</main>")));
    } finally {
      if (previousIndex === undefined) {
        await rm(indexPath, { force: true });
      } else {
        await writeFile(indexPath, previousIndex, "utf8");
      }
    }
  });
});
