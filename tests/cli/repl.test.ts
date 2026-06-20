import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { PassThrough, Writable } from "node:stream";

import { afterEach, describe, expect, it, vi } from "vitest";

import { runCli } from "../../src/cli.js";
import { OpenAIProvider } from "../../src/providers/OpenAIProvider.js";
import type { ProviderStreamEvent } from "../../src/providers/Provider.js";

describe("CLI REPL", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });
  it("lists resumed session history before accepting new input", async () => {
    const workspace = await mkdtemp(path.join(os.tmpdir(), "mini-agent-cli-"));
    const sessionDir = path.join(workspace, ".mini-agent", "workspace", "sessions");
    await import("node:fs/promises").then((fs) => fs.mkdir(sessionDir, { recursive: true }));
    await writeFile(
      path.join(sessionDir, "demo.jsonl"),
      JSON.stringify({ role: "user", content: "old question", timestamp: "2026-06-04T00:00:00.000Z" }) + "\n" +
      JSON.stringify({ role: "assistant", content: "old answer", timestamp: "2026-06-04T00:00:01.000Z" }) + "\n"
    );

    const input = new PassThrough();
    const chunks: string[] = [];
    const output = new Writable({
      write(chunk, _encoding, callback) {
        chunks.push(String(chunk));
        callback();
      }
    });
    input.end("/exit\n");

    await runCli({
      argv: [
      "--workspace",
      workspace,
      "--session",
      "demo",
      "--resume"
      ],
      input,
      output
    });

    const text = chunks.join("");
    expect(text).toContain("Resumed session demo");
    expect(text).toContain("old question");
    expect(text).toContain("old answer");
    await expect(readFile(path.join(sessionDir, "demo.jsonl"), "utf8")).resolves.toContain("old answer");
  });

  it("streams assistant tokens live when --stream is passed", async () => {
    const workspace = await mkdtemp(path.join(os.tmpdir(), "mini-agent-cli-stream-"));
    await import("node:fs/promises").then((fs) => fs.mkdir(path.join(workspace, ".mini-agent"), { recursive: true }));
    await writeFile(
      path.join(workspace, ".mini-agent", "config.json"),
      JSON.stringify({ provider: { apiKey: "test-key" } }) + "\n"
    );
    vi.spyOn(OpenAIProvider.prototype, "chatStream").mockImplementation(async function* (): AsyncIterable<ProviderStreamEvent> {
      yield { type: "delta", content: "Strea" };
      yield { type: "delta", content: "ming!" };
      yield { type: "done", response: { content: "Streaming!", toolCalls: [], finishReason: "stop", usage: { total_tokens: 4 } } };
    });

    const input = new PassThrough();
    const chunks: string[] = [];
    const output = new Writable({
      write(chunk, _encoding, callback) {
        chunks.push(String(chunk));
        callback();
      }
    });
    input.end("hello\n/exit\n");

    await runCli({ argv: ["--workspace", workspace, "--session", "s", "--stream"], input, output });

    const text = chunks.join("");
    expect(text).toContain("assistant> Streaming!");
    expect(text).toContain("usage> total_tokens=4");
    await expect(readFile(path.join(workspace, ".mini-agent", "workspace", "sessions", "s.jsonl"), "utf8"))
      .resolves.toContain("Streaming!");
  });
});
