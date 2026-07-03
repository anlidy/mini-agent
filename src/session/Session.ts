export interface MessageRecord {
  role: string;
  content: unknown;
  tool_call_id?: string;
  name?: string;
  tool_calls?: unknown;
  timestamp: string;
}

export interface SessionMetadata {
  source?: string;
  title?: string;
  workspace?: string;
  [key: string]: unknown;
}

export interface SessionHeader {
  _type: "metadata";
  key: string;
  created_at: string;
  updated_at: string;
  metadata: SessionMetadata;
}

export interface Session {
  key: string;
  messages: MessageRecord[];
  createdAt: string;
  updatedAt: string;
  metadata: SessionMetadata;
}
