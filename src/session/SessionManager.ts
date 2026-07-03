import { mkdir, readFile, readdir, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

import type { MessageRecord, Session, SessionHeader, SessionMetadata } from "./Session.js";

export interface SessionManagerOptions {
  workspace: string;
  sessionsDir?: string;
  source?: string;
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

interface ParsedSessionFile {
  header: SessionHeader;
  messages: MessageRecord[];
}

export class SessionManager {
  private readonly sessions = new Map<string, Session>();
  readonly sessionsDir: string;
  private readonly source: string;

  constructor(options?: Partial<SessionManagerOptions>) {
    const workspace = options?.workspace ?? process.cwd();
    this.sessionsDir = options?.sessionsDir ?? path.join(workspace, ".mini-agent", "workspace", "sessions");
    this.source = options?.source ?? "unknown";
  }

  async getOrCreate(key: string): Promise<Session> {
    const existing = this.sessions.get(key);
    if (existing) {
      return existing;
    }

    const loaded = await this.loadSession(key);
    if (loaded) {
      this.sessions.set(key, loaded);
      return loaded;
    }

    const now = new Date().toISOString();
    const session: Session = {
      key,
      messages: [],
      createdAt: now,
      updatedAt: now,
      metadata: { source: this.source, title: "" }
    };
    this.sessions.set(key, session);
    return session;
  }

  async save(session: Session): Promise<void> {
    await mkdir(this.sessionsDir, { recursive: true });
    const firstTimestamp = session.messages[0]?.timestamp;
    session.createdAt = session.createdAt || firstTimestamp || new Date().toISOString();
    session.updatedAt = new Date().toISOString();
    session.metadata = normalizeMetadata(session.metadata, this.source, session.messages);
    const file = this.sessionPath(session.key);
    const temp = `${file}.${process.pid}.tmp`;
    const lines = [
      JSON.stringify(toSessionHeader(session)),
      ...session.messages.map((message) => JSON.stringify(message))
    ];
    await writeFile(temp, lines.join("\n") + "\n");
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
        const parsed = await readSessionFile(path.join(this.sessionsDir, entry.name));
        return {
          key: parsed.header.key,
          createdAt: parsed.header.created_at,
          updatedAt: parsed.header.updated_at,
          messageCount: parsed.messages.length,
          preview: previewMessage(parsed.messages)
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

  private async loadSession(key: string): Promise<Session | undefined> {
    try {
      const parsed = await readSessionFile(this.sessionPath(key));
      return {
        key: parsed.header.key,
        messages: parsed.messages,
        createdAt: parsed.header.created_at,
        updatedAt: parsed.header.updated_at,
        metadata: normalizeMetadata(parsed.header.metadata, this.source, parsed.messages)
      };
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
        return undefined;
      }
      throw error;
    }
  }
}

export function safeSessionFilename(key: string): string {
  const safe = key.replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/^_+|_+$/g, "");
  return safe || "default";
}

async function readSessionFile(file: string): Promise<ParsedSessionFile> {
  const raw = await readFile(file, "utf8");
  const records = raw.split(/\r?\n/).filter((line) => line.trim().length > 0);
  const [headerLine, ...messageLines] = records;
  if (!headerLine) {
    throw new Error(`Invalid session file ${file}: missing metadata header.`);
  }

  let headerCandidate: unknown;
  try {
    headerCandidate = JSON.parse(headerLine) as unknown;
  } catch {
    throw new Error(`Invalid session file ${file}: metadata header is not valid JSON.`);
  }
  if (!isSessionHeader(headerCandidate)) {
    throw new Error(`Invalid session file ${file}: first line must be metadata.`);
  }

  const messages = messageLines.flatMap((line) => {
    try {
      const parsed = JSON.parse(line) as unknown;
      return isMessageRecord(parsed) ? [parsed] : [];
    } catch {
      return [];
    }
  });

  return { header: headerCandidate, messages };
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

function isSessionHeader(value: unknown): value is SessionHeader {
  return Boolean(
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    (value as Record<string, unknown>)._type === "metadata" &&
    typeof (value as Record<string, unknown>).key === "string" &&
    typeof (value as Record<string, unknown>).created_at === "string" &&
    typeof (value as Record<string, unknown>).updated_at === "string" &&
    typeof (value as Record<string, unknown>).metadata === "object" &&
    (value as Record<string, unknown>).metadata !== null &&
    !Array.isArray((value as Record<string, unknown>).metadata)
  );
}

function previewMessage(messages: MessageRecord[]): string {
  return titleFromMessages(messages);
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

function normalizeMetadata(metadata: SessionMetadata, source: string, messages: MessageRecord[]): SessionMetadata {
  return {
    ...metadata,
    source: typeof metadata.source === "string" && metadata.source ? metadata.source : source,
    title: typeof metadata.title === "string" && metadata.title ? metadata.title : titleFromMessages(messages)
  };
}

function toSessionHeader(session: Session): SessionHeader {
  return {
    _type: "metadata",
    key: session.key,
    created_at: session.createdAt,
    updated_at: session.updatedAt,
    metadata: session.metadata
  };
}

function titleFromMessages(messages: MessageRecord[]): string {
  const user = messages.find((message) => message.role === "user");
  if (!user) {
    return "";
  }
  const text = typeof user.content === "string" ? user.content : JSON.stringify(user.content);
  return text.replace(/\s+/g, " ").trim().slice(0, 60);
}
