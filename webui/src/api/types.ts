export interface SessionSummary {
  key: string;
  version: 0 | 1;
  revision: number;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  title: string;
  workspace?: string;
  effectiveWorkspace: string;
}

export interface MessageRecord {
  role: string;
  content: unknown;
  thinking?: string;
  tool_call_id?: string;
  name?: string;
  tool_calls?: unknown;
  timestamp: string;
}

export interface Session {
  version: 0 | 1;
  key: string;
  revision: number;
  messages: MessageRecord[];
  createdAt: string;
  updatedAt: string;
  metadata: Record<string, unknown>;
  effectiveWorkspace: string;
}

export interface FileTreeNode {
  name: string;
  path: string;
  type: "file" | "directory";
  size?: number;
  children?: FileTreeNode[];
}

export interface FileContent {
  path: string;
  content: string;
}

export interface AgentConfig {
  provider: string;
  model: string;
  thinking: { enabled: boolean; budgetTokens: number };
  effort: 1 | 2 | 3 | 4;
  maxIterations: number;
  maxToolResultChars: number;
  contextWindowTokens?: number;
  outputReserveTokens?: number;
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

export interface ToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}
