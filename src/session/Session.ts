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
