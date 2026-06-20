import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { createExecTool } from "../../src/tools/exec.js";
import { createDefaultToolRegistry } from "../../src/tools/index.js";

async function workspace(): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), "mini-agent-exec-"));
}

describe("exec registry gating", () => {
  it("excludes exec from the default registry unless enabled", () => {
    expect(createDefaultToolRegistry().toolNames).not.toContain("exec");
    expect(createDefaultToolRegistry({ exec: { enabled: false } }).toolNames).not.toContain("exec");
  });

  it("includes exec when enabled", () => {
    expect(createDefaultToolRegistry({ exec: { enabled: true } }).toolNames).toContain("exec");
  });
});

describe("exec tool", () => {
  it("runs a command and returns its stdout", async () => {
    const tool = createExecTool();
    const ws = await workspace();
    const result = String(await tool.execute({ command: "echo hello-exec" }, { workspace: ws }));
    expect(result).toContain("hello-exec");
  });

  it("pins the working directory to the workspace", async () => {
    const tool = createExecTool();
    const ws = await workspace();
    const result = String(await tool.execute({ command: "pwd" }, { workspace: ws }));
    // macOS tmp dirs are symlinked (/var -> /private/var); match the trailing path.
    expect(result).toContain(path.basename(ws));
  });

  it("refuses commands matching the dangerous deny list", async () => {
    const tool = createExecTool();
    const ws = await workspace();
    const result = String(await tool.execute({ command: "rm -rf /" }, { workspace: ws }));
    expect(result).toContain("Error");
    expect(result.toLowerCase()).toContain("refus");
  });

  it("reports a non-zero exit code and stderr", async () => {
    const tool = createExecTool();
    const ws = await workspace();
    const result = String(await tool.execute({ command: "ls /nonexistent-path-xyz 1>&2; exit 3" }, { workspace: ws }));
    expect(result).toContain("exit code 3");
  });

  it("kills commands that exceed the timeout", async () => {
    const tool = createExecTool({ timeoutMs: 50 });
    const ws = await workspace();
    const result = String(await tool.execute({ command: "sleep 5" }, { workspace: ws }));
    expect(result.toLowerCase()).toContain("timed out");
  });

  it("truncates large output", async () => {
    const tool = createExecTool({ maxOutputChars: 20 });
    const ws = await workspace();
    const result = String(await tool.execute({ command: "for i in $(seq 1 100); do echo line$i; done" }, { workspace: ws }));
    expect(result).toContain("[truncated]");
  });

  it("refuses when the approval callback returns false", async () => {
    const tool = createExecTool();
    const ws = await workspace();
    const result = String(await tool.execute(
      { command: "echo should-not-run" },
      { workspace: ws, approveCommand: () => false }
    ));
    expect(result).toContain("Error");
    expect(result.toLowerCase()).toContain("not approved");
    expect(result).not.toContain("should-not-run");
  });

  it("runs when the approval callback returns true", async () => {
    const tool = createExecTool();
    const ws = await workspace();
    const result = String(await tool.execute(
      { command: "echo approved-run" },
      { workspace: ws, approveCommand: async () => true }
    ));
    expect(result).toContain("approved-run");
  });
});
