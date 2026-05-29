import type { Agent, AgentOptions, RunOptions, RunResult } from "./types.js";

export class AgentLoop implements Agent {
  readonly workspace: string;
  readonly model?: string;
  readonly maxIterations: number;

  constructor(options: AgentOptions = {}) {
    this.workspace = options.workspace ?? process.cwd();
    this.model = options.model;
    this.maxIterations = options.maxIterations ?? 10;
  }

  async run(input: string, options: RunOptions = {}): Promise<RunResult> {
    const sessionKey = options.sessionKey ?? "default";
    return {
      content: input,
      sessionKey,
      toolsUsed: []
    };
  }
}

export function createAgent(options: AgentOptions = {}): Agent {
  return new AgentLoop(options);
}
