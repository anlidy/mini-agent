import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { PassThrough, Writable } from "node:stream";

import { describe, expect, it } from "vitest";

import { runCli } from "../../src/cli.js";

describe("CLI REPL", () => {
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
});
