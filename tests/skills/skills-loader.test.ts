import { mkdir, mkdtemp, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { SkillsLoader, SkillValidationError } from "../../src/skills/SkillsLoader.js";
import { createReadSkillTool } from "../../src/tools/skills.js";

async function writeSkill(root: string, id: string, description: string, body: string, always = false): Promise<void> {
  const dir = path.join(root, id);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, "SKILL.md"), `---\nname: ${id}\ndescription: ${description}\nalways: ${always}\n---\n\n${body}\n`);
}

describe("SkillsLoader", () => {
  it("loads global and project catalogs with project ids overriding global ids", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "mini-agent-skills-"));
    const global = path.join(root, "global");
    const workspace = path.join(root, "project");
    await writeSkill(global, "shared", "global description", "global body");
    await writeSkill(global, "global-only", "global only", "global", true);
    await writeSkill(path.join(workspace, "skills"), "shared", "project description", "project body");
    const loader = new SkillsLoader({ workspace, globalSkillsDir: global });
    expect(await loader.list()).toMatchObject([
      { id: "global-only", source: "global", always: true },
      { id: "shared", source: "project", description: "project description" }
    ]);
    await expect(loader.loadSkill("shared")).resolves.toContain("project body");
  });

  it("rejects missing/mismatched frontmatter and skill path escapes", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "mini-agent-invalid-skills-"));
    const workspace = path.join(root, "project");
    const bad = path.join(workspace, "skills", "bad");
    await mkdir(bad, { recursive: true });
    await writeFile(path.join(bad, "SKILL.md"), "---\nname: other\ndescription: x\n---\n");
    await expect(new SkillsLoader(workspace).list()).rejects.toBeInstanceOf(SkillValidationError);

    await writeFile(path.join(bad, "SKILL.md"), "---\nname: bad\ndescription: ok\n---\n");
    const outside = path.join(root, "outside.md");
    await writeFile(outside, "---\nname: escape\ndescription: no\n---\n");
    const escapeDir = path.join(workspace, "skills", "escape");
    await mkdir(escapeDir, { recursive: true });
    await symlink(outside, path.join(escapeDir, "SKILL.md"));
    await expect(new SkillsLoader(workspace).list()).rejects.toThrow("escapes its skills directory");
  });

  it("read_skill resolves catalog ids without opening arbitrary paths", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "mini-agent-read-skill-"));
    const global = path.join(root, "global");
    const workspace = path.join(root, "project");
    await writeSkill(global, "safe", "safe skill", "instructions");
    const tool = createReadSkillTool(global);
    await expect(tool.execute({ id: "safe" }, { workspace })).resolves.toContain("instructions");
    await expect(tool.execute({ id: "../outside" }, { workspace })).rejects.toThrow("Unknown skill");
  });

  it("rejects a project skills root that is a symlink outside the workspace", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "mini-agent-skills-root-escape-"));
    const workspace = path.join(root, "project");
    const outside = path.join(root, "outside-skills");
    await mkdir(workspace, { recursive: true });
    await writeSkill(outside, "escaped", "outside skill", "must not load");
    await symlink(outside, path.join(workspace, "skills"));

    await expect(new SkillsLoader(workspace).list()).rejects.toThrow("escapes its runtime boundary");
  });
});
