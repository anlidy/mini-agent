export interface MessageRecord {
  role: string;
  content: unknown;
  timestamp: string;
}

export interface Session {
  key: string;
  messages: MessageRecord[];
  createdAt: string;
  updatedAt: string;
  metadata: Record<string, unknown>;
}
