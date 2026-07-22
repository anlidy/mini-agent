import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

import type { Config } from "../config/Config.js";
import { defaultConfig, ensureDefaultConfig, writeConfig } from "../config/loadConfig.js";
import { SessionManager, readSessionFile } from "../session/SessionManager.js";
import type { RuntimePaths } from "./paths.js";

export interface ImportReport {
  apply: boolean;
  sessions: { imported: string[]; skipped: string[]; conflicts: string[] };
  config: { copied: string[]; skipped: string[]; conflicts: string[] };
}

export async function importLegacyWorkspace(paths: RuntimePaths, apply = false): Promise<ImportReport> {
  const sourceHome = paths.legacyHome();
  const sourceConfig = await readJson(path.join(sourceHome, "config.json"));
  const report: ImportReport = {
    apply,
    sessions: { imported: [], skipped: [], conflicts: [] },
    config: { copied: [], skipped: [], conflicts: [] }
  };

  await importSessions(path.join(sourceHome, "workspace", "sessions"), paths, apply, report);
  if (sourceConfig) await importConfig(sourceConfig, paths, apply, report);
  return report;
}

export function importedSessionKey(workspace: string, sourceKey: string): string {
  const digest = createHash("sha256").update(`${workspace}\0${sourceKey}`).digest("hex");
  return `import-${digest}`;
}

async function importSessions(sourceDir: string, paths: RuntimePaths, apply: boolean, report: ImportReport): Promise<void> {
  let entries;
  try {
    entries = await readdir(sourceDir, { withFileTypes: true });
  } catch (error) {
    if (hasCode(error, "ENOENT")) return;
    throw error;
  }
  const target = new SessionManager({ sessionsDir: paths.sessionsDir, source: "import" });
  for (const entry of entries.filter((item) => item.isFile() && item.name.endsWith(".jsonl")).sort((a, b) => a.name.localeCompare(b.name))) {
    const parsed = await readSessionFile(path.join(sourceDir, entry.name));
    const key = importedSessionKey(paths.projectWorkspace, parsed.header.key);
    const existing = await target.get(key);
    if (existing) {
      const sameSource = existing.metadata.import_source_workspace === paths.projectWorkspace &&
        existing.metadata.import_source_session_key === parsed.header.key;
      (sameSource ? report.sessions.skipped : report.sessions.conflicts).push(key);
      continue;
    }
    report.sessions.imported.push(key);
    if (!apply) continue;
    const created = await target.create(key, {
      ...parsed.header.metadata,
      workspace: paths.projectWorkspace,
      import_source_workspace: paths.projectWorkspace,
      import_source_session_key: parsed.header.key
    });
    created.messages = structuredClone(parsed.messages);
    await target.save(created);
  }
}

async function importConfig(source: Record<string, unknown>, paths: RuntimePaths, apply: boolean, report: ImportReport): Promise<void> {
  const target = apply ? await ensureDefaultConfig(paths.home) : await loadTargetOrDefault(paths);
  const agents = objectRecord(source.agents);
  const providers = objectRecord(source.providers);
  const agentAdds: Config["agents"] = {};
  const providerAdds: Config["providers"] = {};
  compareNamed("agents", agents, target.agents, agentAdds, report);
  compareNamed("providers", providers, target.providers, providerAdds, report);
  if (apply && (Object.keys(agentAdds).length > 0 || Object.keys(providerAdds).length > 0)) {
    await writeConfig({ agents: agentAdds, providers: providerAdds }, paths.home);
  }
  // sessions.dir and legacy history-size settings are intentionally never copied.
}

function compareNamed(
  kind: "agents" | "providers",
  source: Record<string, unknown>,
  target: Record<string, unknown>,
  additions: Record<string, unknown>,
  report: ImportReport
): void {
  for (const [key, value] of Object.entries(source)) {
    const label = `${kind}.${key}`;
    if (!(key in target)) {
      additions[key] = value;
      report.config.copied.push(label);
    } else if (JSON.stringify(target[key]) === JSON.stringify(value)) {
      report.config.skipped.push(label);
    } else {
      report.config.conflicts.push(label);
    }
  }
}

async function loadTargetOrDefault(paths: RuntimePaths): Promise<Config> {
  const raw = await readJson(paths.configFile);
  if (!raw) return defaultConfig(paths.home);
  const { parseConfig } = await import("../config/schema.js");
  const defaults = defaultConfig(paths.home);
  return parseConfig({ ...defaults, ...raw }, paths.home);
}

async function readJson(file: string): Promise<Record<string, unknown> | undefined> {
  try {
    const parsed = JSON.parse(await readFile(file, "utf8")) as unknown;
    return objectRecord(parsed);
  } catch (error) {
    if (hasCode(error, "ENOENT")) return undefined;
    throw error;
  }
}

function objectRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function hasCode(error: unknown, code: string): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === code);
}
