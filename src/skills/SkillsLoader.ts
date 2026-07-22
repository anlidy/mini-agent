import { realpath, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";

export interface SkillSummary {
  id: string;
  name: string;
  description: string;
  always: boolean;
  source: "global" | "project";
}

interface CatalogEntry extends SkillSummary {
  file: string;
}

export class SkillValidationError extends Error {
  readonly code = "skill_invalid";

  constructor(message: string) {
    super(message);
    this.name = "SkillValidationError";
  }
}

export class SkillsLoader {
  readonly workspace: string;
  readonly globalSkillsDir?: string;

  constructor(options: string | { workspace: string; globalSkillsDir?: string }) {
    this.workspace = typeof options === "string" ? options : options.workspace;
    this.globalSkillsDir = typeof options === "string" ? undefined : options.globalSkillsDir;
  }

  async list(): Promise<SkillSummary[]> {
    const catalog = await this.catalog();
    return [...catalog.values()].map(({ file: _file, ...summary }) => summary);
  }

  async summaryText(): Promise<string> {
    const skills = await this.list();
    if (skills.length === 0) return "No skills installed.";
    return skills
      .map((skill) => `- ${skill.id}: ${skill.description} [${skill.source}]${skill.always ? " (always)" : ""}`)
      .join("\n");
  }

  async loadSkill(id: string): Promise<string> {
    const entry = (await this.catalog()).get(id);
    if (!entry) throw new SkillValidationError(`Unknown skill "${id}".`);
    return readFile(entry.file, "utf8");
  }

  private async catalog(): Promise<Map<string, CatalogEntry>> {
    const catalog = new Map<string, CatalogEntry>();
    if (this.globalSkillsDir) {
      for (const entry of await loadRoot(this.globalSkillsDir, "global", path.dirname(this.globalSkillsDir))) {
        if (catalog.has(entry.id)) throw new SkillValidationError(`Duplicate global skill id "${entry.id}".`);
        catalog.set(entry.id, entry);
      }
    }
    for (const entry of await loadRoot(path.join(this.workspace, "skills"), "project", this.workspace)) {
      catalog.set(entry.id, entry);
    }
    return new Map([...catalog.entries()].sort(([left], [right]) => left.localeCompare(right)));
  }
}

async function loadRoot(root: string, source: "global" | "project", boundary: string): Promise<CatalogEntry[]> {
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch (error) {
    if (hasCode(error, "ENOENT")) return [];
    throw error;
  }
  const canonicalRoot = await realpath(root);
  const canonicalBoundary = await realpath(boundary);
  if (!isContained(canonicalBoundary, canonicalRoot)) {
    throw new SkillValidationError(`${source} skills directory escapes its runtime boundary.`);
  }
  const result: CatalogEntry[] = [];
  const ids = new Set<string>();
  for (const dir of entries.filter((entry) => entry.isDirectory() || entry.isSymbolicLink()).sort((a, b) => a.name.localeCompare(b.name))) {
    if (ids.has(dir.name)) throw new SkillValidationError(`Duplicate ${source} skill id "${dir.name}".`);
    ids.add(dir.name);
    const file = path.join(root, dir.name, "SKILL.md");
    let canonicalFile: string;
    let content: string;
    try {
      canonicalFile = await realpath(file);
      content = await readFile(canonicalFile, "utf8");
    } catch (error) {
      throw new SkillValidationError(`Cannot read ${source} skill "${dir.name}": ${error instanceof Error ? error.message : String(error)}`);
    }
    if (!isContained(canonicalRoot, canonicalFile)) {
      throw new SkillValidationError(`${source} skill "${dir.name}" escapes its skills directory.`);
    }
    const frontmatter = parseFrontmatter(content, `${source} skill "${dir.name}"`);
    if (frontmatter.name !== dir.name) {
      throw new SkillValidationError(`${source} skill "${dir.name}" must declare frontmatter name: ${dir.name}.`);
    }
    if (typeof frontmatter.description !== "string" || !frontmatter.description.trim()) {
      throw new SkillValidationError(`${source} skill "${dir.name}" must declare a non-empty description.`);
    }
    result.push({ id: dir.name, name: dir.name, description: frontmatter.description.trim(), always: frontmatter.always === true, source, file: canonicalFile });
  }
  return result;
}

function parseFrontmatter(content: string, label: string): Record<string, unknown> {
  if (!content.startsWith("---\n")) throw new SkillValidationError(`${label} is missing YAML frontmatter.`);
  const end = content.indexOf("\n---", 4);
  if (end === -1) throw new SkillValidationError(`${label} has unterminated YAML frontmatter.`);
  try {
    const parsed = YAML.parse(content.slice(4, end)) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("frontmatter must be an object");
    return parsed as Record<string, unknown>;
  } catch (error) {
    throw new SkillValidationError(`${label} has invalid YAML frontmatter: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function isContained(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function hasCode(error: unknown, code: string): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === code);
}
