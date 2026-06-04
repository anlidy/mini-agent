import { readFile } from "node:fs/promises";
import path from "node:path";

import type { AgentMessage } from "./AgentRunner.js";

export interface ContextBuilderOptions {
  workspace: string;
  now?: () => Date;
}

export interface BuildMessagesOptions {
  input: string;
  sessionKey: string;
  history: AgentMessage[];
  skillsSummary?: string;
}

export class ContextBuilder {
  readonly workspace: string;
  private readonly now: () => Date;

  constructor(options: string | ContextBuilderOptions) {
    this.workspace = typeof options === "string" ? options : options.workspace;
    this.now = typeof options === "string" ? () => new Date() : options.now ?? (() => new Date());
  }

  async buildMessages(options: BuildMessagesOptions): Promise<AgentMessage[]> {
    const system = await this.buildSystemPrompt(options.skillsSummary);
    return mergeAdjacentSameRole([
      { role: "system", content: system },
      ...options.history,
      {
        role: "user",
        content: `${options.input}\n\n<runtime_context>\ncurrent_time: ${this.now().toISOString()}\nworkspace: ${this.workspace}\nsession_key: ${options.sessionKey}\n</runtime_context>`
      }
    ]);
  }

  private async buildSystemPrompt(skillsSummary?: string): Promise<string> {
    const identity = await readPrompt("identity.md");
    const toolContract = await readPrompt("tool_contract.md");
    const skillsTemplate = await readPrompt("skills_section.md");
    const bootstrap = await this.readBootstrapFiles();
    return [
      identity,
      bootstrap ? `# Workspace Bootstrap\n\n${bootstrap}` : "",
      toolContract,
      `${skillsTemplate}\n\n${skillsSummary ?? "No skills installed."}`
    ].filter(Boolean).join("\n\n");
  }

  private async readBootstrapFiles(): Promise<string> {
    const sections: string[] = [];
    for (const name of ["AGENTS.md", "SOUL.md", "USER.md"]) {
      try {
        sections.push(`## ${name}\n\n${await readFile(path.join(this.workspace, name), "utf8")}`);
      } catch (error) {
        if (!(error && typeof error === "object" && "code" in error && error.code === "ENOENT")) {
          throw error;
        }
      }
    }
    return sections.join("\n\n");
  }
}

function mergeAdjacentSameRole(messages: AgentMessage[]): AgentMessage[] {
  const merged: AgentMessage[] = [];
  for (const message of messages) {
    const previous = merged.at(-1);
    if (
      previous &&
      previous.role === message.role &&
      typeof previous.content === "string" &&
      typeof message.content === "string" &&
      !previous.tool_calls &&
      !message.tool_calls &&
      message.role !== "tool"
    ) {
      previous.content = `${previous.content}\n\n${message.content}`;
    } else {
      merged.push({ ...message });
    }
  }
  return merged;
}

async function readPrompt(name: string): Promise<string> {
  return readFile(path.join(import.meta.dirname, "..", "prompts", name), "utf8");
}
