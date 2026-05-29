export interface AgentOptions {
  workspace?: string;
  model?: string;
  maxIterations?: number;
}

export interface RunOptions {
  sessionKey?: string;
}

export interface RunResult {
  content: string;
  sessionKey: string;
  toolsUsed: string[];
}

export interface Agent {
  run(input: string, options?: RunOptions): Promise<RunResult>;
}
