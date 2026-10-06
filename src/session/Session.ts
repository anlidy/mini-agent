export interface MessageRecord {
  role: string;
  content: unknown;
  /** Thinking / chain-of-thought content from the assistant. */
  thinking?: string;
  tool_call_id?: string;
  name?: string;
  tool_calls?: unknown;
  /**
   * Set on the last assistant message of a turn that ended early. The turn's
   * completed tool calls are kept because their side effects already happened.
   */
  interrupted?: "user" | "error";
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
  version: 1;
  key: string;
  revision: number;
  message_count: number;
  created_at: string;
  updated_at: string;
  metadata: SessionMetadata;
}

export interface Session {
  version: 0 | 1;
  key: string;
  revision: number;
  messages: MessageRecord[];
  createdAt: string;
  updatedAt: string;
  metadata: SessionMetadata;
}
