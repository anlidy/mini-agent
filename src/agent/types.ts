import type { LLMProvider } from "../providers/Provider.js";
import type { ToolRegistry } from "../tools/ToolRegistry.js";

export interface AgentOptions {
  workspace?: string;
  model?: string;
  maxIterations?: number;
  maxToolResultChars?: number;
  provider?: LLMProvider;
  tools?: ToolRegistry;
  sessionKey?: string;
  sessionsDir?: string;
}

export interface RunOptions {
  sessionKey?: string;
  signal?: AbortSignal;
}

export interface RunResult {
  content: string;
  sessionKey: string;
  toolsUsed: string[];
  usage: Record<string, number>;
}

export interface Agent {
  run(input: string, options?: RunOptions): Promise<RunResult>;
}
