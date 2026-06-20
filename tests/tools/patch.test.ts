import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { createPatchTool } from "../../src/tools/patch.js";

async function workspace(): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), "mini-agent-patch-"));
}

const tool = createPatchTool();

describe("apply_patch tool", () => {
  it("applies a single-hunk modification", async () => {
    const ws = await workspace();
    await writeFile(path.join(ws, "a.txt"), "one\ntwo\nthree\n");
    const patch = [
      "--- a/a.txt",
      "+++ b/a.txt",
      "@@ -1,3 +1,3 @@",
      " one",
      "-two",
      "+TWO",
      " three"
    ].join("\n");

    const result = String(await tool.execute({ patch }, { workspace: ws }));
    expect(result).toContain("a.txt");
    await expect(readFile(path.join(ws, "a.txt"), "utf8")).resolves.toBe("one\nTWO\nthree\n");
  });

  it("matches context even when the hunk line numbers are off", async () => {
    const ws = await workspace();
    await writeFile(path.join(ws, "b.txt"), "header\n\n\none\ntwo\nthree\n");
    const patch = [
      "--- a/b.txt",
      "+++ b/b.txt",
      "@@ -1,3 +1,3 @@",
      " one",
      "-two",
      "+TWO",
      " three"
    ].join("\n");

    await tool.execute({ patch }, { workspace: ws });
    await expect(readFile(path.join(ws, "b.txt"), "utf8")).resolves.toBe("header\n\n\none\nTWO\nthree\n");
  });

  it("supports dry-run without writing", async () => {
    const ws = await workspace();
    await writeFile(path.join(ws, "c.txt"), "alpha\nbeta\n");
    const patch = [
      "--- a/c.txt",
      "+++ b/c.txt",
      "@@ -1,2 +1,2 @@",
      " alpha",
      "-beta",
      "+BETA"
    ].join("\n");

    const result = String(await tool.execute({ patch, dryRun: true }, { workspace: ws }));
    expect(result).toContain("BETA");
    // File unchanged.
    await expect(readFile(path.join(ws, "c.txt"), "utf8")).resolves.toBe("alpha\nbeta\n");
  });

  it("applies multiple hunks", async () => {
    const ws = await workspace();
    await writeFile(path.join(ws, "d.txt"), "1\n2\n3\n4\n5\n6\n");
    const patch = [
      "--- a/d.txt",
      "+++ b/d.txt",
      "@@ -1,2 +1,2 @@",
      " 1",
      "-2",
      "+TWO",
      "@@ -5,2 +5,2 @@",
      " 5",
      "-6",
      "+SIX"
    ].join("\n");

    await tool.execute({ patch }, { workspace: ws });
    await expect(readFile(path.join(ws, "d.txt"), "utf8")).resolves.toBe("1\nTWO\n3\n4\n5\nSIX\n");
  });

  it("creates a new file from a /dev/null source", async () => {
    const ws = await workspace();
    const patch = [
      "--- /dev/null",
      "+++ b/new.txt",
      "@@ -0,0 +1,2 @@",
      "+hello",
      "+world"
    ].join("\n");

    const result = String(await tool.execute({ patch }, { workspace: ws }));
    expect(result).toContain("new.txt");
    await expect(readFile(path.join(ws, "new.txt"), "utf8")).resolves.toBe("hello\nworld\n");
  });

  it("returns an error when context does not match", async () => {
    const ws = await workspace();
    await writeFile(path.join(ws, "e.txt"), "completely\ndifferent\n");
    const patch = [
      "--- a/e.txt",
      "+++ b/e.txt",
      "@@ -1,2 +1,2 @@",
      " nonexistent",
      "-lines",
      "+changed"
    ].join("\n");

    const result = String(await tool.execute({ patch }, { workspace: ws }));
    expect(result).toContain("Error");
    await expect(readFile(path.join(ws, "e.txt"), "utf8")).resolves.toBe("completely\ndifferent\n");
  });

  it("rejects paths that escape the workspace", async () => {
    const ws = await workspace();
    const patch = [
      "--- a/../outside.txt",
      "+++ b/../outside.txt",
      "@@ -0,0 +1,1 @@",
      "+evil"
    ].join("\n");

    const result = String(await tool.execute({ patch }, { workspace: ws }));
    expect(result).toContain("Error");
  });
});
