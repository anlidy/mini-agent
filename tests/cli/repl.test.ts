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

  it("lists registered tools via /tools without calling the model", async () => {
    const workspace = await mkdtemp(path.join(os.tmpdir(), "mini-agent-cli-tools-"));
    const text = await runRepl(workspace, "/tools\n/exit\n");
    expect(text).toContain("Registered tools");
    expect(text).toContain("apply_patch");
    expect(text).toContain("web_search");
    // exec is opt-in and config here does not enable it.
    expect(text).not.toContain("\n  exec —");
  });

  it("runs apply_patch directly via /tool (offline, deterministic)", async () => {
    const workspace = await mkdtemp(path.join(os.tmpdir(), "mini-agent-cli-tool-"));
    const patch = ["--- /dev/null", "+++ b/created.txt", "@@ -0,0 +1,1 @@", "+made by /tool"].join("\n");
    const command = `/tool apply_patch ${JSON.stringify({ patch })}\n/exit\n`;
    const text = await runRepl(workspace, command);
    expect(text).toContain("created.txt");
    await expect(readFile(path.join(workspace, "created.txt"), "utf8")).resolves.toBe("made by /tool\n");
  });

  it("reports invalid JSON args for /tool", async () => {
    const workspace = await mkdtemp(path.join(os.tmpdir(), "mini-agent-cli-badjson-"));
    const text = await runRepl(workspace, "/tool apply_patch {not json}\n/exit\n");
    expect(text).toContain("invalid JSON");
  });

  it("prints a clean config error instead of a stack trace", async () => {
    const workspace = await mkdtemp(path.join(os.tmpdir(), "mini-agent-cli-badcfg-"));
    await import("node:fs/promises").then((fs) => fs.mkdir(path.join(workspace, ".mini-agent"), { recursive: true }));
    await writeFile(
      path.join(workspace, ".mini-agent", "config.json"),
      JSON.stringify({ agent: { maxIterations: "lots" } }) + "\n"
    );
    const text = await runRepl(workspace, "");
    expect(text).toContain("Config error");
    expect(text).toContain("agent.maxIterations");
    expect(text).not.toContain("at ensureDefaultConfig");
  });
});

async function runRepl(workspace: string, stdinText: string): Promise<string> {
  const input = new PassThrough();
  const chunks: string[] = [];
  const output = new Writable({
    write(chunk, _encoding, callback) {
      chunks.push(String(chunk));
      callback();
    }
  });
  input.end(stdinText);
  await runCli({ argv: ["--workspace", workspace, "--session", "v"], input, output });
  return chunks.join("");
}
