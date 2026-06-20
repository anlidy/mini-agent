export interface Config {
  workspace: string;
  provider: {
    name?: string;
    apiKey?: string;
    baseUrl?: string;
    model?: string;
    timeoutMs?: number;
  };
  agent: {
    maxIterations: number;
    maxToolResultChars: number;
    contextWindowTokens?: number;
  };
  sessions: {
    dir: string;
    defaultKey: string;
    maxHistoryMessages: number;
    maxHistoryChars: number;
  };
  search?: {
    backend: "duckduckgo" | "none";
    maxResults: number;
  };
  exec?: {
    enabled: boolean;
    timeoutMs: number;
    maxOutputChars: number;
  };
}
