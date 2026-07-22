import { mkdir, mkdtemp, readFile, readdir, utimes, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { SessionConflictError, SessionKeyCollisionError, SessionManager, SessionParseError, safeSessionFilename } from "../../src/session/SessionManager.js";

describe("SessionManager", () => {
  it("persists sessions as JSONL under workspace/sessions and resumes history", async () => {
    const workspace = await mkdtemp(path.join(os.tmpdir(), "mini-agent-session-"));
    const manager = new SessionManager({ sessionsDir: path.join(workspace, "workspace", "sessions") });
    const session = await manager.getOrCreate("project:default");

    session.messages.push(
      { role: "user", content: "hello", timestamp: "2026-06-04T00:00:00.000Z" },
      { role: "assistant", content: "hi", timestamp: "2026-06-04T00:00:01.000Z" }
    );
    await manager.save(session);

    const sessionPath = manager.sessionPath("project:default");
    const lines = (await readFile(sessionPath, "utf8")).trim().split("\n");

    expect(lines).toHaveLength(3);
    expect(JSON.parse(lines[0] ?? "{}")).toMatchObject({
      _type: "metadata",
      version: 1,
      key: "project:default",
      revision: 1,
      message_count: 2,
      metadata: {}
    });
    expect(JSON.parse(lines[1] ?? "{}")).toMatchObject({ role: "user", content: "hello" });

    const resumed = await new SessionManager({ sessionsDir: path.join(workspace, "workspace", "sessions") }).getOrCreate("project:default");
    expect(resumed.messages).toEqual(session.messages);
    expect(resumed.key).toBe("project:default");
  });

  it("returns trimmed history without starting on orphan tool results", async () => {
    const workspace = await mkdtemp(path.join(os.tmpdir(), "mini-agent-history-"));
    const manager = new SessionManager({ sessionsDir: path.join(workspace, "workspace", "sessions") });
    const session = await manager.getOrCreate("default");

    session.messages.push(
      { role: "tool", tool_call_id: "orphan", name: "read_file", content: "orphan", timestamp: "2026-06-04T00:00:00.000Z" },
      { role: "user", content: "one", timestamp: "2026-06-04T00:00:01.000Z" },
      { role: "assistant", content: "two", timestamp: "2026-06-04T00:00:02.000Z" },
      { role: "user", content: "three", timestamp: "2026-06-04T00:00:03.000Z" }
    );

    expect(manager.getHistory(session, { maxMessages: 3, maxChars: 1000 })).toEqual([
      { role: "user", content: "one" },
      { role: "assistant", content: "two" },
      { role: "user", content: "three" }
    ]);
  });

  it("lists session summaries sorted by update time and titles from the first user message", async () => {
    const workspace = await mkdtemp(path.join(os.tmpdir(), "mini-agent-list-sessions-"));
    const manager = new SessionManager({ sessionsDir: path.join(workspace, "workspace", "sessions") });
    const alpha = await manager.getOrCreate("alpha");
    alpha.messages.push(
      { role: "assistant", content: "ignored", timestamp: "2026-06-04T00:00:00.000Z" },
      { role: "user", content: "first user message that becomes the preview", timestamp: "2026-06-04T00:00:01.000Z" }
    );
    await manager.save(alpha);
    await new Promise((r) => setTimeout(r, 2));
    const beta = await manager.getOrCreate("beta");
    beta.messages.push({ role: "user", content: "newer", timestamp: "2026-06-04T00:00:02.000Z" });
    await manager.save(beta);

    const summaries = await manager.listSessions();

    expect(summaries.map((summary) => summary.key)).toEqual(["beta", "alpha"]);
    expect(summaries[1]).toMatchObject({
      key: "alpha",
      messageCount: 2,
      title: "first user message that becomes the preview"
    });
  });

  it("deletes a session file and cached session idempotently", async () => {
    const workspace = await mkdtemp(path.join(os.tmpdir(), "mini-agent-delete-session-"));
    const manager = new SessionManager({ sessionsDir: path.join(workspace, "workspace", "sessions") });
    const session = await manager.getOrCreate("delete-me");
    session.messages.push({ role: "user", content: "bye", timestamp: "2026-06-04T00:00:00.000Z" });
    await manager.save(session);

    await manager.deleteSession("delete-me");
    await manager.deleteSession("delete-me");

    expect(await manager.listSessions()).toEqual([]);
    const recreated = await manager.getOrCreate("delete-me");
    expect(recreated.messages).toEqual([]);
  });

  it("loads the canonical session key from metadata instead of deriving it from the filename", async () => {
    const workspace = await mkdtemp(path.join(os.tmpdir(), "mini-agent-metadata-key-"));
    const manager = new SessionManager({ sessionsDir: path.join(workspace, "workspace", "sessions") });
    const session = await manager.getOrCreate("project:default");
    session.messages.push({ role: "user", content: "hello", timestamp: "2026-06-04T00:00:00.000Z" });
    await manager.save(session);

    const summaries = await manager.listSessions();

    expect(summaries).toHaveLength(1);
    expect(summaries[0]?.key).toBe("project:default");
  });

  it("upgrades a v0 snapshot to a v1 header on first save", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "mini-agent-v0-upgrade-"));
    const manager = new SessionManager({ sessionsDir: path.join(root, "sessions") });
    await mkdir(manager.sessionsDir, { recursive: true });
    await writeFile(manager.sessionPath("legacy"), [
      JSON.stringify({ _type: "metadata", key: "legacy", created_at: "2026-01-01T00:00:00.000Z", updated_at: "2026-01-01T00:00:00.000Z", metadata: {} }),
      JSON.stringify({ role: "user", content: "old", timestamp: "2026-01-01T00:00:00.000Z" })
    ].join("\n") + "\n");

    const legacy = await manager.get("legacy");
    expect(legacy).toMatchObject({ version: 0, revision: 0 });
    const saved = await manager.save(legacy!);
    const header = JSON.parse((await readFile(manager.sessionPath("legacy"), "utf8")).split("\n")[0]!);
    expect(saved).toMatchObject({ version: 1, revision: 1 });
    expect(header).toMatchObject({ version: 1, revision: 1, message_count: 1 });
  });

  it("reports the original JSONL line number for invalid records", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "mini-agent-invalid-line-"));
    const manager = new SessionManager({ sessionsDir: path.join(root, "sessions") });
    await mkdir(manager.sessionsDir, { recursive: true });
    await writeFile(manager.sessionPath("broken"), [
      JSON.stringify({ _type: "metadata", version: 1, key: "broken", revision: 1, message_count: 2, created_at: "x", updated_at: "x", metadata: {} }),
      JSON.stringify({ role: "user", content: "ok", timestamp: "x" }),
      "{broken"
    ].join("\n") + "\n");
    await expect(manager.get("broken")).rejects.toMatchObject({
      name: "SessionParseError",
      message: expect.stringContaining("line 3")
    });
  });

  it("uses full SHA-256 filenames and rejects a mismatched header key", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "mini-agent-key-hash-"));
    const manager = new SessionManager({ sessionsDir: path.join(root, "sessions") });
    expect(safeSessionFilename("a:b")).toMatch(/^[a-f0-9]{64}$/);
    await mkdir(manager.sessionsDir, { recursive: true });
    await writeFile(manager.sessionPath("requested"), JSON.stringify({
      _type: "metadata", version: 1, key: "different", revision: 1, message_count: 0,
      created_at: "x", updated_at: "x", metadata: {}
    }) + "\n");
    await expect(manager.get("requested")).rejects.toBeInstanceOf(SessionKeyCollisionError);
  });

  it("detects CAS conflicts across independent managers", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "mini-agent-cas-"));
    const dir = path.join(root, "sessions");
    const first = new SessionManager({ sessionsDir: dir });
    const second = new SessionManager({ sessionsDir: dir });
    await first.create("shared");
    const left = await first.get("shared");
    const right = await second.get("shared");
    left!.metadata.title = "left";
    right!.metadata.title = "right";
    await first.save(left!);
    await expect(second.save(right!)).rejects.toBeInstanceOf(SessionConflictError);
  });

  it("returns detached snapshots that cannot mutate persisted state", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "mini-agent-snapshot-clone-"));
    const manager = new SessionManager({ sessionsDir: path.join(root, "sessions") });
    const created = await manager.create("detached", { title: "saved" });

    created.metadata.title = "mutated";
    created.messages.push({ role: "user", content: "not saved", timestamp: "x" });

    await expect(manager.get("detached")).resolves.toMatchObject({
      revision: 1,
      messages: [],
      metadata: { title: "saved" }
    });
  });

  it("recovers an unchanged stale lock and leaves no temporary files", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "mini-agent-stale-lock-"));
    const manager = new SessionManager({ sessionsDir: path.join(root, "sessions"), staleLockMs: 10 });
    await mkdir(manager.sessionsDir, { recursive: true });
    const lock = `${manager.sessionPath("locked")}.lock`;
    await writeFile(lock, "stale");
    const old = new Date(Date.now() - 60_000);
    await utimes(lock, old, old);
    await manager.create("locked");
    expect((await readdir(manager.sessionsDir)).filter((name) => name.endsWith(".tmp") || name.endsWith(".lock"))).toEqual([]);
  });

  it("lists v1 summaries from the header without parsing message lines", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "mini-agent-header-list-"));
    const manager = new SessionManager({ sessionsDir: path.join(root, "sessions") });
    await mkdir(manager.sessionsDir, { recursive: true });
    await writeFile(manager.sessionPath("header-only"), JSON.stringify({
      _type: "metadata", version: 1, key: "header-only", revision: 3, message_count: 9,
      created_at: "x", updated_at: "y", metadata: { title: "summary" }
    }) + "\nnot-json\n");
    await expect(manager.listSessions()).resolves.toMatchObject([{ key: "header-only", revision: 3, messageCount: 9 }]);
    await expect(manager.get("header-only")).rejects.toBeInstanceOf(SessionParseError);
  });
});
