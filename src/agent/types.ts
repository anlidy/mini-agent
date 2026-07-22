import type { Config } from "../config/Config.js";
import type { LLMProvider } from "../providers/Provider.js";
import type { SessionManager } from "../session/SessionManager.js";
import type { ToolRegistry } from "../tools/ToolRegistry.js";
import type { AgentEvent } from "./events.js";

export interface AgentOptions {
  /** Project working directory. Defaults to cwd. */
  workspace?: string;
  /** Global runtime home. Defaults to MINI_AGENT_HOME or ~/.mini-agent. */
  runtimeHome?: string;
  /** Full config. When provided, the agent is built from config.agents[agentKey]. */
  config?: Config;
  /** Which agent to use from config.agents. Defaults to "default". */
  agentKey?: string;
  /** Override provider (for testing or when config is not available). */
  provider?: LLMProvider;
  /** Override model. */
  model?: string;
  /** Override max iterations. */
  maxIterations?: number;
  /** Override max tool result chars. */
  maxToolResultChars?: number;
  tools?: ToolRegistry;
  sessionKey?: string;
  sessionsDir?: string;
  sessionSource?: string;
  sessions?: SessionManager;
  approveCommand?: (command: string) => Promise<boolean> | boolean;
}

export interface RunOptions {
  sessionKey?: string;
  signal?: AbortSignal;
  approveCommand?: (command: string) => Promise<boolean> | boolean;
}

export interface RunResult {
  content: string;
  sessionKey: string;
  toolsUsed: string[];
  usage: Record<string, number>;
}

export interface Agent {
  run(input: string, options?: RunOptions): Promise<RunResult>;
  stream?(input: string, options?: RunOptions): AsyncIterable<AgentEvent>;
}
