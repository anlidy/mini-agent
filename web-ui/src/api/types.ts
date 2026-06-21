export interface SessionSummary {
  key: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  preview: string;
}

export interface MessageRecord {
  role: string;
  content: unknown;
  tool_call_id?: string;
  name?: string;
  tool_calls?: unknown;
  timestamp: string;
}

export interface Session {
  key: string;
  messages: MessageRecord[];
  createdAt: string;
  updatedAt: string;
  metadata: Record<string, unknown>;
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

export interface ToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}
