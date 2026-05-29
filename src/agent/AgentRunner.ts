export interface AgentRunSpec {
  maxIterations: number;
}

export interface AgentRunResult {
  finalContent: string | null;
  toolsUsed: string[];
  stopReason: "completed" | "max_iterations" | "error";
}

export class AgentRunner {
  async run(spec: AgentRunSpec): Promise<AgentRunResult> {
    if (spec.maxIterations <= 0) {
      return {
        finalContent: null,
        toolsUsed: [],
        stopReason: "max_iterations"
      };
    }

    return {
      finalContent: "",
      toolsUsed: [],
      stopReason: "completed"
    };
  }
}
