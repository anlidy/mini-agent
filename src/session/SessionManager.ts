import { mkdir, readFile, readdir, rename, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

import type { MessageRecord, Session } from "./Session.js";

export interface SessionManagerOptions {
  workspace: string;
  sessionsDir?: string;
}

export interface HistoryOptions {
  maxMessages: number;
  maxChars: number;
}

export interface SessionSummary {
  key: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  preview: string;
}

export class SessionManager {
  private readonly sessions = new Map<string, Session>();
  readonly sessionsDir: string;

  constructor(options?: Partial<SessionManagerOptions>) {
    const workspace = options?.workspace ?? process.cwd();
    this.sessionsDir = options?.sessionsDir ?? path.join(workspace, ".mini-agent", "workspace", "sessions");
  }

  async getOrCreate(key: string): Promise<Session> {
    const existing = this.sessions.get(key);
    if (existing) {
      return existing;
    }

    const now = new Date().toISOString();
    const messages = await this.loadMessages(key);
    const session: Session = {
      key,
      messages,
      createdAt: now,
      updatedAt: messages.at(-1)?.timestamp ?? now,
      metadata: {}
    };
    this.sessions.set(key, session);
    return session;
  }

  async save(session: Session): Promise<void> {
    await mkdir(this.sessionsDir, { recursive: true });
    session.updatedAt = new Date().toISOString();
    const file = this.sessionPath(session.key);
    const temp = `${file}.${process.pid}.tmp`;
    const content = session.messages.map((message) => JSON.stringify(message)).join("\n");
    await writeFile(temp, content ? `${content}\n` : "");
    await rename(temp, file);
    this.sessions.set(session.key, session);
  }

  async listSessions(): Promise<SessionSummary[]> {
    let entries;
    try {
      entries = await readdir(this.sessionsDir, { withFileTypes: true });
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
        return [];
      }
      throw error;
    }

    const summaries = await Promise.all(entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".jsonl"))
      .map(async (entry) => {
        const key = entry.name.slice(0, -".jsonl".length);
        const file = path.join(this.sessionsDir, entry.name);
        const [messages, fileStat] = await Promise.all([readSessionFile(file), stat(file)]);
        const firstTimestamp = messages[0]?.timestamp;
        const lastTimestamp = messages.at(-1)?.timestamp;
        return {
          key,
          createdAt: firstTimestamp ?? fileStat.birthtime.toISOString(),
          updatedAt: lastTimestamp ?? fileStat.mtime.toISOString(),
          messageCount: messages.length,
          preview: previewMessage(messages)
        };
      }));

    return summaries.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  async deleteSession(key: string): Promise<void> {
    this.sessions.delete(key);
    try {
      await unlink(this.sessionPath(key));
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
        return;
      }
      throw error;
    }
  }

  getHistory(session: Session, options: HistoryOptions): Array<Record<string, unknown>> {
    const trimmed: Array<Record<string, unknown>> = [];
    let usedChars = 0;

    for (let index = session.messages.length - 1; index >= 0; index -= 1) {
      const message = session.messages[index];
      if (!message) {
        continue;
      }
      const compact = toModelMessage(message);
      const chars = JSON.stringify(compact).length;
      if (trimmed.length >= options.maxMessages || (trimmed.length > 0 && usedChars + chars > options.maxChars)) {
        break;
      }
      trimmed.unshift(compact);
      usedChars += chars;
    }

    while (trimmed[0]?.role === "tool") {
      trimmed.shift();
    }
    return trimmed;
  }

  sessionPath(key: string): string {
    return path.join(this.sessionsDir, `${safeSessionFilename(key)}.jsonl`);
  }

  private async loadMessages(key: string): Promise<Session["messages"]> {
    try {
      return await readSessionFile(this.sessionPath(key));
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
        return [];
      }
      throw error;
    }
  }
}

export function safeSessionFilename(key: string): string {
  const safe = key.replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/^_+|_+$/g, "");
  return safe || "default";
}

function isMessageRecord(value: unknown): value is Session["messages"][number] {
  return Boolean(
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    typeof (value as Record<string, unknown>).role === "string" &&
    "content" in value &&
    typeof (value as Record<string, unknown>).timestamp === "string"
  );
}

async function readSessionFile(file: string): Promise<MessageRecord[]> {
  const raw = await readFile(file, "utf8");
  return raw.split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .flatMap((line) => {
      try {
        const parsed = JSON.parse(line) as unknown;
        return isMessageRecord(parsed) ? [parsed] : [];
      } catch {
        return [];
      }
    });
}

function previewMessage(messages: MessageRecord[]): string {
  const user = messages.find((message) => message.role === "user");
  if (!user) {
    return "";
  }
  const text = typeof user.content === "string" ? user.content : JSON.stringify(user.content);
  return text.length > 120 ? `${text.slice(0, 120)}...` : text;
}

function toModelMessage(message: Session["messages"][number]): Record<string, unknown> {
  const modelMessage: Record<string, unknown> = {
    role: message.role,
    content: message.content
  };
  if (message.tool_call_id) {
    modelMessage.tool_call_id = message.tool_call_id;
  }
  if (message.name) {
    modelMessage.name = message.name;
  }
  if (message.tool_calls) {
    modelMessage.tool_calls = message.tool_calls;
  }
  return modelMessage;
}
