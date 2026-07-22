import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { loadConfig } from "../../src/config/loadConfig.js";
import { importLegacyWorkspace, importedSessionKey } from "../../src/runtime/importLegacy.js";
import { RuntimePaths, resolveRuntimeHome } from "../../src/runtime/paths.js";
import { SessionManager } from "../../src/session/SessionManager.js";

const previousHome = process.env.MINI_AGENT_HOME;

afterEach(() => {
  if (previousHome === undefined) delete process.env.MINI_AGENT_HOME;
  else process.env.MINI_AGENT_HOME = previousHome;
});

describe("RuntimePaths and legacy import", () => {
  it("uses MINI_AGENT_HOME and gives unbound sessions isolated scratch directories", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "mini-agent-runtime-paths-"));
    process.env.MINI_AGENT_HOME = path.join(root, "home");
    expect(resolveRuntimeHome()).toBe(path.join(root, "home"));
    const paths = new RuntimePaths({ workspace: root });
    expect(paths.sessionsDir).toBe(path.join(root, "home", "sessions"));
    const first = await paths.effectiveWorkspace(null, "first");
    const second = await paths.effectiveWorkspace(undefined, "second");
    expect(first).not.toBe(second);
    expect(first.startsWith(paths.scratchDir)).toBe(true);
  });

  it("normalizes workspaces through realpath and rejects files", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "mini-agent-workspace-realpath-"));
    const paths = new RuntimePaths({ home: path.join(root, "home"), workspace: root });
    await writeFile(path.join(root, "file"), "x");
    await expect(paths.normalizeWorkspace(path.join(root, "."))).resolves.toBe(root);
    await expect(paths.normalizeWorkspace(path.join(root, "file"))).rejects.toThrow("not a directory");
  });

  it("imports legacy sessions and missing config entries only on --apply, idempotently", async () => {
    const workspace = await mkdtemp(path.join(os.tmpdir(), "mini-agent-import-"));
    const runtimeHome = path.join(workspace, "global-home");
    const legacyHome = path.join(workspace, ".mini-agent");
    const sourceSessions = path.join(legacyHome, "workspace", "sessions");
    await mkdir(sourceSessions, { recursive: true });
    const sourceSession = [
      JSON.stringify({ _type: "metadata", key: "old", created_at: "x", updated_at: "y", metadata: { title: "legacy" } }),
      JSON.stringify({ role: "user", content: "from old runtime", timestamp: "x" })
    ].join("\n") + "\n";
    const sourceFile = path.join(sourceSessions, "old.jsonl");
    await writeFile(sourceFile, sourceSession);
    await writeFile(path.join(legacyHome, "config.json"), JSON.stringify({
      agents: {
        default: { provider: "deepseek", model: "legacy-conflict" },
        imported: { provider: "other", model: "other-model", thinking: { enabled: false, budgetTokens: 1000 }, effort: 1, maxIterations: 5, maxToolResultChars: 1000, outputReserveTokens: 100, params: {} }
      },
      providers: {
        deepseek: { type: "openai", baseUrl: "https://legacy.invalid" },
        other: { type: "openai", baseUrl: "https://other.invalid" }
      },
      sessions: { dir: "/must/not/import", maxHistoryMessages: 1, maxHistoryChars: 1 }
    }));
    const paths = new RuntimePaths({ home: runtimeHome, workspace });

    const dryRun = await importLegacyWorkspace(paths, false);
    expect(dryRun.sessions.imported).toEqual([importedSessionKey(workspace, "old")]);
    expect(dryRun.config.conflicts).toContain("agents.default");
    expect(dryRun.config.copied).toEqual(expect.arrayContaining(["agents.imported", "providers.other"]));
    await expect(readFile(sourceFile, "utf8")).resolves.toBe(sourceSession);
    await expect(readFile(paths.configFile, "utf8")).rejects.toMatchObject({ code: "ENOENT" });

    await importLegacyWorkspace(paths, true);
    const key = importedSessionKey(workspace, "old");
    const imported = await new SessionManager({ sessionsDir: paths.sessionsDir }).get(key);
    expect(imported?.messages[0]?.content).toBe("from old runtime");
    expect(imported?.metadata).toMatchObject({ import_source_workspace: workspace, import_source_session_key: "old" });
    const config = await loadConfig(runtimeHome);
    expect(config.agents.imported?.model).toBe("other-model");
    expect(config.sessions.dir).toBe(path.join(runtimeHome, "sessions"));

    const repeated = await importLegacyWorkspace(paths, true);
    expect(repeated.sessions.skipped).toEqual([key]);
    await expect(readFile(sourceFile, "utf8")).resolves.toBe(sourceSession);
  });
});
