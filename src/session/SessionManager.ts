import { createHash, randomUUID } from "node:crypto";
import {
  mkdir,
  open,
  readFile,
  readdir,
  rename,
  stat,
  unlink,
  writeFile
} from "node:fs/promises";
import path from "node:path";
import { resolveRuntimeHome } from "../runtime/paths.js";

import type { MessageRecord, Session, SessionHeader, SessionMetadata } from "./Session.js";

export interface SessionManagerOptions {
  sessionsDir?: string;
  source?: string;
  lockWaitMs?: number;
  staleLockMs?: number;
}

export interface HistoryOptions {
  maxMessages: number;
  /** Retained for one compatibility release; token budgeting owns trimming. */
  maxChars?: number;
}

export interface SessionSummary {
  key: string;
  version: 0 | 1;
  revision: number;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  title: string;
  workspace?: string;
}

export interface ParsedSessionFile {
  header: SessionHeader | LegacySessionHeader;
  messages: MessageRecord[];
}

interface LegacySessionHeader {
  _type: "metadata";
  key: string;
  created_at: string;
  updated_at: string;
  metadata: SessionMetadata;
}

export class SessionConflictError extends Error {
  readonly code = "session_conflict";

  constructor(message: string) {
    super(message);
    this.name = "SessionConflictError";
  }
}

export class SessionBusyError extends Error {
  readonly code = "session_busy";

  constructor(key: string) {
    super(`Session "${key}" already has an active turn.`);
    this.name = "SessionBusyError";
  }
}

export class SessionKeyCollisionError extends Error {
  readonly code = "session_key_collision";

  constructor(expected: string, actual: string) {
    super(`Session key collision: expected "${expected}" but found "${actual}".`);
    this.name = "SessionKeyCollisionError";
  }
}

export class SessionParseError extends Error {
  readonly code = "session_parse_error";

  constructor(file: string, line: number, detail: string) {
    super(`Invalid session file ${file} at line ${line}: ${detail}`);
    this.name = "SessionParseError";
  }
}

export class SessionManager {
  readonly sessionsDir: string;
  private readonly source: string;
  private readonly lockWaitMs: number;
  private readonly staleLockMs: number;
  private readonly leases = new Set<string>();

  constructor(options?: SessionManagerOptions) {
    this.sessionsDir = options?.sessionsDir ?? path.join(resolveRuntimeHome(), "sessions");
    this.source = options?.source ?? "unknown";
    this.lockWaitMs = options?.lockWaitMs ?? 5_000;
    this.staleLockMs = options?.staleLockMs ?? 30_000;
  }

  async get(key: string): Promise<Session | undefined> {
    return this.loadSession(key);
  }

  async getOrCreate(key: string): Promise<Session> {
    return (await this.get(key)) ?? this.newSnapshot(key);
  }

  async create(key: string = randomUUID(), metadata: SessionMetadata = {}): Promise<Session> {
    if (await this.get(key)) {
      throw new SessionConflictError(`Session "${key}" already exists.`);
    }
    const snapshot = this.newSnapshot(key, metadata);
    return this.save(snapshot);
  }

  async save(snapshot: Session): Promise<Session> {
    await mkdir(this.sessionsDir, { recursive: true });
    const file = this.sessionPath(snapshot.key);
    const release = await this.acquireFileLock(file);
    let temp: string | undefined;
    try {
      const disk = await this.loadSession(snapshot.key);
      const diskRevision = disk?.revision ?? 0;
      if (diskRevision !== snapshot.revision) {
        throw new SessionConflictError(
          `Session "${snapshot.key}" changed from revision ${snapshot.revision} to ${diskRevision}.`
        );
      }

      const now = new Date().toISOString();
      const messages = structuredClone(snapshot.messages);
      const saved: Session = {
        version: 1,
        key: snapshot.key,
        revision: snapshot.revision + 1,
        messages,
        createdAt: snapshot.createdAt || messages[0]?.timestamp || now,
        updatedAt: now,
        metadata: normalizeMetadata(structuredClone(snapshot.metadata), this.source, messages)
      };
      temp = `${file}.${process.pid}.${randomUUID()}.tmp`;
      const lines = [
        JSON.stringify(toSessionHeader(saved)),
        ...saved.messages.map((message) => JSON.stringify(message))
      ];
      await writeFile(temp, `${lines.join("\n")}\n`, "utf8");
      await rename(temp, file);
      temp = undefined;
      return cloneSession(saved);
    } finally {
      if (temp) {
        await unlink(temp).catch(() => undefined);
      }
      await release();
    }
  }

  async listSessions(): Promise<SessionSummary[]> {
    let entries;
    try {
      entries = await readdir(this.sessionsDir, { withFileTypes: true });
    } catch (error) {
      if (hasCode(error, "ENOENT")) {
        return [];
      }
      throw error;
    }

    const summaries = await Promise.all(entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".jsonl"))
      .map(async (entry) => {
        const file = path.join(this.sessionsDir, entry.name);
        const header = await readHeader(file);
        const isV1 = isV1Header(header);
        if (isV1 && entry.name !== `${safeSessionFilename(header.key)}.jsonl`) {
          throw new SessionKeyCollisionError(`${safeSessionFilename(header.key)}.jsonl`, entry.name);
        }
        const parsed = isV1 ? undefined : await readSessionFile(file);
        const messages = parsed?.messages ?? [];
        return {
          key: header.key,
          version: isV1 ? 1 as const : 0 as const,
          revision: isV1 ? header.revision : 0,
          createdAt: header.created_at,
          updatedAt: header.updated_at,
          messageCount: isV1 ? header.message_count : messages.length,
          title: typeof header.metadata.title === "string" ? header.metadata.title : titleFromMessages(messages),
          workspace: typeof header.metadata.workspace === "string" ? header.metadata.workspace : undefined
        };
      }));

    return summaries.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  async deleteSession(key: string): Promise<void> {
    if (this.isBusy(key)) {
      throw new SessionBusyError(key);
    }
    const file = this.sessionPath(key);
    const release = await this.acquireFileLock(file);
    try {
      const existing = await this.loadSession(key);
      if (!existing) {
        return;
      }
      await unlink(file);
    } finally {
      await release();
    }
  }

  acquireLease(key: string): () => void {
    if (this.leases.has(key)) {
      throw new SessionBusyError(key);
    }
    this.leases.add(key);
    let released = false;
    return () => {
      if (!released) {
        released = true;
        this.leases.delete(key);
      }
    };
  }

  isBusy(key: string): boolean {
    return this.leases.has(key);
  }

  getHistory(session: Session, options: HistoryOptions): Array<Record<string, unknown>> {
    const turns = groupCompleteTurns(session.messages);
    const kept: MessageRecord[][] = [];
    let count = 0;
    for (let index = turns.length - 1; index >= 0; index -= 1) {
      const turn = turns[index]!;
      if (kept.length > 0 && count + turn.length > options.maxMessages) {
        break;
      }
      kept.unshift(turn);
      count += turn.length;
    }
    return kept.flat().map(toModelMessage);
  }

  sessionPath(key: string): string {
    return path.join(this.sessionsDir, `${safeSessionFilename(key)}.jsonl`);
  }

  private newSnapshot(key: string, metadata: SessionMetadata = {}): Session {
    const now = new Date().toISOString();
    return {
      version: 1,
      key,
      revision: 0,
      messages: [],
      createdAt: now,
      updatedAt: now,
      metadata: normalizeMetadata(structuredClone(metadata), this.source, [])
    };
  }

  private async loadSession(key: string): Promise<Session | undefined> {
    const file = this.sessionPath(key);
    try {
      const parsed = await readSessionFile(file);
      if (parsed.header.key !== key) {
        throw new SessionKeyCollisionError(key, parsed.header.key);
      }
      const revision = isV1Header(parsed.header) ? parsed.header.revision : 0;
      return cloneSession({
        version: isV1Header(parsed.header) ? 1 : 0,
        key: parsed.header.key,
        revision,
        messages: parsed.messages,
        createdAt: parsed.header.created_at,
        updatedAt: parsed.header.updated_at,
        metadata: normalizeMetadata(parsed.header.metadata, this.source, parsed.messages)
      });
    } catch (error) {
      if (hasCode(error, "ENOENT")) {
        return undefined;
      }
      throw error;
    }
  }

  private async acquireFileLock(file: string): Promise<() => Promise<void>> {
    const lock = `${file}.lock`;
    const owner = JSON.stringify({ pid: process.pid, id: randomUUID(), createdAt: new Date().toISOString() });
    const deadline = Date.now() + this.lockWaitMs;
    while (true) {
      let created = false;
      try {
        const handle = await open(lock, "wx");
        created = true;
        try {
          await handle.writeFile(owner, "utf8");
        } finally {
          await handle.close();
        }
        return async () => {
          const current = await readFile(lock, "utf8").catch(() => undefined);
          if (current === owner) {
            await unlink(lock).catch(() => undefined);
          }
        };
      } catch (error) {
        if (created) await unlink(lock).catch(() => undefined);
        if (!hasCode(error, "EEXIST")) {
          throw error;
        }
        await this.removeStaleLock(lock);
        if (Date.now() >= deadline) {
          throw new SessionBusyError(path.basename(file, ".jsonl"));
        }
        await delay(50);
      }
    }
  }

  private async removeStaleLock(lock: string): Promise<void> {
    const beforeStat = await stat(lock).catch(() => undefined);
    const beforeContent = beforeStat ? await readFile(lock, "utf8").catch(() => undefined) : undefined;
    if (!beforeStat || beforeContent === undefined || Date.now() - beforeStat.mtimeMs < this.staleLockMs) {
      return;
    }
    const afterStat = await stat(lock).catch(() => undefined);
    const afterContent = afterStat ? await readFile(lock, "utf8").catch(() => undefined) : undefined;
    if (afterStat && afterContent === beforeContent && afterStat.mtimeMs === beforeStat.mtimeMs) {
      await unlink(lock).catch(() => undefined);
    }
  }
}

export function safeSessionFilename(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

export async function readSessionFile(file: string): Promise<ParsedSessionFile> {
  const raw = await readFile(file, "utf8");
  const lines = raw.split(/\r?\n/);
  if (lines.at(-1) === "") lines.pop();
  if (lines.length === 0) {
    throw new SessionParseError(file, 1, "missing metadata header");
  }
  const header = parseLine(lines[0]!, file, 1);
  if (!isSessionHeader(header)) {
    throw new SessionParseError(file, 1, "first line must be metadata");
  }
  const messages: MessageRecord[] = [];
  for (let index = 1; index < lines.length; index += 1) {
    const parsed = parseLine(lines[index]!, file, index + 1);
    if (!isMessageRecord(parsed)) {
      throw new SessionParseError(file, index + 1, "invalid message record");
    }
    messages.push(parsed);
  }
  if (isV1Header(header) && header.message_count !== messages.length) {
    throw new SessionParseError(file, 1, `message_count is ${header.message_count}, found ${messages.length}`);
  }
  return { header, messages };
}

async function readHeader(file: string): Promise<SessionHeader | LegacySessionHeader> {
  const handle = await open(file, "r");
  try {
    const buffer = Buffer.alloc(64 * 1024);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    const text = buffer.subarray(0, bytesRead).toString("utf8");
    const newline = text.indexOf("\n");
    if (newline === -1 && bytesRead === buffer.length) {
      throw new SessionParseError(file, 1, "metadata header exceeds 64 KiB");
    }
    const parsed = parseLine((newline === -1 ? text : text.slice(0, newline)).replace(/\r$/, ""), file, 1);
    if (!isSessionHeader(parsed)) {
      throw new SessionParseError(file, 1, "first line must be metadata");
    }
    return parsed;
  } finally {
    await handle.close();
  }
}

function parseLine(line: string, file: string, lineNumber: number): unknown {
  if (!line.trim()) {
    throw new SessionParseError(file, lineNumber, "empty JSONL record");
  }
  try {
    return JSON.parse(line) as unknown;
  } catch (error) {
    throw new SessionParseError(file, lineNumber, error instanceof Error ? error.message : "invalid JSON");
  }
}

function isMessageRecord(value: unknown): value is MessageRecord {
  return Boolean(
    value && typeof value === "object" && !Array.isArray(value) &&
    typeof (value as Record<string, unknown>).role === "string" &&
    "content" in value && typeof (value as Record<string, unknown>).timestamp === "string"
  );
}

function isSessionHeader(value: unknown): value is SessionHeader | LegacySessionHeader {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const record = value as Record<string, unknown>;
  const base = record._type === "metadata" && typeof record.key === "string" &&
    typeof record.created_at === "string" && typeof record.updated_at === "string" &&
    record.metadata !== null && typeof record.metadata === "object" && !Array.isArray(record.metadata);
  if (!base || record.version === undefined) {
    return base;
  }
  return record.version === 1 && Number.isInteger(record.revision) && (record.revision as number) >= 0 &&
    Number.isInteger(record.message_count) && (record.message_count as number) >= 0;
}

function isV1Header(header: SessionHeader | LegacySessionHeader): header is SessionHeader {
  return "version" in header && header.version === 1;
}

function toModelMessage(message: MessageRecord): Record<string, unknown> {
  const modelMessage: Record<string, unknown> = { role: message.role, content: message.content };
  if (message.tool_call_id) modelMessage.tool_call_id = message.tool_call_id;
  if (message.name) modelMessage.name = message.name;
  if (message.tool_calls) modelMessage.tool_calls = message.tool_calls;
  return modelMessage;
}

function normalizeMetadata(metadata: SessionMetadata, source: string, messages: MessageRecord[]): SessionMetadata {
  const normalized: SessionMetadata = { ...metadata };
  if (!(typeof normalized.source === "string" && normalized.source)) {
    normalized.source = source;
  }
  if (!(typeof normalized.title === "string" && normalized.title)) {
    normalized.title = titleFromMessages(messages);
  }
  return normalized;
}

function toSessionHeader(session: Session): SessionHeader {
  return {
    _type: "metadata",
    version: 1,
    key: session.key,
    revision: session.revision,
    message_count: session.messages.length,
    created_at: session.createdAt,
    updated_at: session.updatedAt,
    metadata: session.metadata
  };
}

function titleFromMessages(messages: MessageRecord[]): string {
  const user = messages.find((message) => message.role === "user");
  if (!user) return "";
  const text = typeof user.content === "string" ? user.content : JSON.stringify(user.content);
  return text.replace(/\s+/g, " ").trim().slice(0, 60);
}

function groupCompleteTurns(messages: MessageRecord[]): MessageRecord[][] {
  const turns: MessageRecord[][] = [];
  let current: MessageRecord[] = [];
  for (const message of messages) {
    if (message.role === "user" && current.length > 0) {
      turns.push(current);
      current = [];
    }
    current.push(message);
  }
  if (current.length > 0) turns.push(current);
  return turns.filter((turn) => turn.some((message) => message.role === "user"));
}

function cloneSession(session: Session): Session {
  return structuredClone(session);
}

function hasCode(error: unknown, code: string): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === code);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
