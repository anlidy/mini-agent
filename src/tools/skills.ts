import type { Tool } from "./Tool.js";
import { SkillsLoader } from "../skills/SkillsLoader.js";

export function createReadSkillTool(globalSkillsDir: string): Tool {
  return {
    name: "read_skill",
    description: "Read an installed skill by its stable catalog id.",
    parameters: {
      type: "object",
      properties: { id: { type: "string", description: "Skill id shown in the system prompt." } },
      required: ["id"],
      additionalProperties: false
    },
    async execute(args, context) {
      return new SkillsLoader({ workspace: context.workspace, globalSkillsDir }).loadSkill(String(args.id));
    }
  };
}
