import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";

export interface SkillSummary {
  name: string;
  description: string;
  always: boolean;
}

export class SkillsLoader {
  constructor(readonly workspace: string) {}

  async list(): Promise<SkillSummary[]> {
    const skillsDir = path.join(this.workspace, "skills");
    try {
      const entries = await readdir(skillsDir, { withFileTypes: true });
      const summaries = await Promise.all(entries
        .filter((entry) => entry.isDirectory())
        .map(async (entry) => this.loadSummary(entry.name)));
      return summaries.filter((summary): summary is SkillSummary => summary !== null);
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
        return [];
      }
      throw error;
    }
  }

  async summaryText(): Promise<string> {
    const skills = await this.list();
    if (skills.length === 0) {
      return "No skills installed.";
    }
    return skills
      .map((skill) => `- ${skill.name}: ${skill.description}${skill.always ? " (always)" : ""}`)
      .join("\n");
  }

  async loadSkill(name: string): Promise<string> {
    return readFile(path.join(this.workspace, "skills", name, "SKILL.md"), "utf8");
  }

  private async loadSummary(name: string): Promise<SkillSummary | null> {
    const content = await this.loadSkill(name);
    const frontmatter = parseFrontmatter(content);
    return {
      name: String(frontmatter.name ?? name),
      description: String(frontmatter.description ?? "(no description)"),
      always: frontmatter.always === true
    };
  }
}

function parseFrontmatter(content: string): Record<string, unknown> {
  if (!content.startsWith("---")) {
    return {};
  }
  const end = content.indexOf("\n---", 3);
  if (end === -1) {
    return {};
  }
  const raw = content.slice(3, end);
  const parsed = YAML.parse(raw) as unknown;
  return parsed && typeof parsed === "object" && !Array.isArray(parsed)
    ? parsed as Record<string, unknown>
    : {};
}
