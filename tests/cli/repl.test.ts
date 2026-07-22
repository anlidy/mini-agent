import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { PassThrough, Writable } from "node:stream";

import { afterEach, describe, expect, it, vi } from "vitest";

import { runCli } from "../../src/cli.js";
import { OpenAIProvider } from "../../src/providers/OpenAIProvider.js";
import type { ProviderStreamEvent } from "../../src/providers/Provider.js";
import { safeSessionFilename, SessionManager } from "../../src/session/SessionManager.js";

describe("CLI REPL", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });
  it("lists resumed session history before accepting new input", async () => {
    const workspace = await mkdtemp(path.join(os.tmpdir(), "mini-agent-cli-"));
    const runtimeHome = path.join(workspace, "runtime");
    const sessionDir = path.join(runtimeHome, "sessions");
    const manager = new SessionManager({ sessionsDir: sessionDir, source: "cli" });
    const initial = await manager.create("demo", { workspace });
    initial.messages.push(
      { role: "user", content: "old question", timestamp: "2026-06-04T00:00:00.000Z" },
      { role: "assistant", content: "old answer", timestamp: "2026-06-04T00:00:01.000Z" }
    );
    await manager.save(initial);

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
      output,
      runtimeHome
    });

    const text = chunks.join("");
    expect(text).toContain("Resumed session demo");
    expect(text).toContain("old question");
    expect(text).toContain("old answer");
    await expect(readFile(path.join(sessionDir, `${safeSessionFilename("demo")}.jsonl`), "utf8")).resolves.toContain("old answer");
  });

  it("streams assistant tokens live when --stream is passed", async () => {
    const workspace = await mkdtemp(path.join(os.tmpdir(), "mini-agent-cli-stream-"));
    const runtimeHome = path.join(workspace, "runtime");
    await import("node:fs/promises").then((fs) => fs.mkdir(runtimeHome, { recursive: true }));
    await writeFile(
      path.join(runtimeHome, "config.json"),
      JSON.stringify({ providers: { deepseek: { type: "openai", apiKey: "test-key" } } }) + "\n"
    );
    vi.spyOn(OpenAIProvider.prototype, "chatStream").mockImplementation(async function* (): AsyncIterable<ProviderStreamEvent> {
      yield { type: "delta", content: "Strea" };
      yield { type: "delta", content: "ming!" };
      yield { type: "done", response: { content: "Streaming!", reasoningContent: null, toolCalls: [], finishReason: "stop", usage: { total_tokens: 4 } } };
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

    await runCli({ argv: ["--workspace", workspace, "--session", "s", "--stream"], input, output, runtimeHome });

    const text = chunks.join("");
    expect(text).toContain("assistant> Streaming!");
    expect(text).toContain("usage> total_tokens=4");
    await expect(readFile(path.join(runtimeHome, "sessions", `${safeSessionFilename("s")}.jsonl`), "utf8"))
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
    const runtimeHome = path.join(workspace, "runtime");
    await import("node:fs/promises").then((fs) => fs.mkdir(runtimeHome, { recursive: true }));
    await writeFile(
      path.join(runtimeHome, "config.json"),
      JSON.stringify({ agents: { default: { maxIterations: "lots" } } }) + "\n"
    );
    const text = await runRepl(workspace, "", runtimeHome);
    expect(text).toContain("Config error");
    expect(text).toContain("agents.default.maxIterations");
    expect(text).not.toContain("at ensureDefaultConfig");
  });
});

async function runRepl(workspace: string, stdinText: string, runtimeHome = path.join(workspace, "runtime")): Promise<string> {
  const input = new PassThrough();
  const chunks: string[] = [];
  const output = new Writable({
    write(chunk, _encoding, callback) {
      chunks.push(String(chunk));
      callback();
    }
  });
  input.end(stdinText);
  await runCli({ argv: ["--workspace", workspace, "--session", "v"], input, output, runtimeHome });
  return chunks.join("");
}
