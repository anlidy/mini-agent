export interface AgentConfig {
  /** Key into the providers map. */
  provider: string;
  model: string;
  thinking: { enabled: boolean; budgetTokens: number };
  effort: 1 | 2 | 3 | 4; // 1=auto, 2=low, 3=medium, 4=high
  maxIterations: number;
  maxToolResultChars: number;
  contextWindowTokens?: number;
  /** Provider-specific extra parameters. */
  params: Record<string, unknown>;
}

export interface ProviderConfig {
  type: "openai" | "anthropic";
  apiKey?: string;
  baseUrl?: string;
  timeoutMs?: number;
  /** Curated list of available model IDs for this provider. */
  models?: string[];
}

export interface Config {
  agents: Record<string, AgentConfig>;
  providers: Record<string, ProviderConfig>;
  sessions: {
    dir: string;
    maxHistoryMessages: number;
    maxHistoryChars: number;
  };
  tools: {
    search?: {
      backend: "duckduckgo" | "none";
      maxResults: number;
    };
    exec?: {
      enabled: boolean;
      timeoutMs: number;
      maxOutputChars: number;
    };
  };
}
