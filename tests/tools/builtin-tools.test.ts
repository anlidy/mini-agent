import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { createDefaultToolRegistry } from "../../src/tools/index.js";

describe("built-in tools", () => {
  it("reads, writes, lists, finds, and greps files inside the workspace", async () => {
    const workspace = await mkdtemp(path.join(os.tmpdir(), "mini-agent-tools-"));
    await writeFile(path.join(workspace, "README.md"), "hello agent\nneedle here\n");

    const registry = createDefaultToolRegistry();

    await expect(registry.execute("read_file", { path: "README.md" }, { workspace }))
      .resolves.toContain("needle here");

    await expect(registry.execute("write_file", { path: "notes/todo.txt", content: "ship it" }, { workspace }))
      .resolves.toContain("Wrote notes/todo.txt");
    await expect(readFile(path.join(workspace, "notes", "todo.txt"), "utf8"))
      .resolves.toBe("ship it");

    await expect(registry.execute("list_dir", { path: "." }, { workspace }))
      .resolves.toContain("README.md");
    await expect(registry.execute("find_files", { pattern: "*.md" }, { workspace }))
      .resolves.toContain("README.md");
    await expect(registry.execute("grep", { pattern: "needle" }, { workspace }))
      .resolves.toContain("README.md:2:needle here");
  });

  it("rejects paths outside the workspace", async () => {
    const workspace = await mkdtemp(path.join(os.tmpdir(), "mini-agent-boundary-"));
    const registry = createDefaultToolRegistry();

    await expect(registry.execute("read_file", { path: "../outside.txt" }, { workspace }))
      .resolves.toContain("Error");
  });
});
