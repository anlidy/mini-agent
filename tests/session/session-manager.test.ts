import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { SessionManager } from "../../src/session/SessionManager.js";

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

    const sessionPath = path.join(workspace, "workspace", "sessions", "project_default.jsonl");
    const lines = (await readFile(sessionPath, "utf8")).trim().split("\n");

    expect(lines).toHaveLength(3);
    expect(JSON.parse(lines[0] ?? "{}")).toMatchObject({
      _type: "metadata",
      key: "project:default",
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
});
