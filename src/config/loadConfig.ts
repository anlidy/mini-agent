import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import type { Config } from "./Config.js";
import { parseConfig } from "./schema.js";

export const REDACTED_API_KEY = "***";

export interface ConfigPatch {
  provider?: Partial<Config["provider"]>;
  agent?: Partial<Config["agent"]>;
  search?: Partial<NonNullable<Config["search"]>>;
  exec?: Partial<NonNullable<Config["exec"]>>;
}

export function defaultConfig(configDir?: string): Config {
  const cdir = configDir ?? path.join(process.cwd(), ".mini-agent");
  return {
    provider: {
      name: "deepseek",
      baseUrl: "https://api.deepseek.com/v1",
      model: "deepseek-chat",
      timeoutMs: 60_000
    },
    agent: {
      maxIterations: 100,
      maxToolResultChars: 64_000,
      contextWindowTokens: 32_000
    },
    sessions: {
      dir: path.join(cdir, "workspace", "sessions"),
      defaultKey: "default",
      maxHistoryMessages: 50,
      maxHistoryChars: 200_000
    }
  };
}

export async function ensureDefaultConfig(configDir?: string): Promise<Config> {
  const cdir = configDir ?? path.join(process.cwd(), ".mini-agent");
  const configPath = configFilePath(cdir);
  try {
    return await loadConfig(cdir);
  } catch (error) {
    if (!(error && typeof error === "object" && "code" in error && error.code === "ENOENT")) {
      throw error;
    }
  }

  const config = defaultConfig(cdir);
  await mkdir(path.dirname(configPath), { recursive: true });
  await writeFile(configPath, `${JSON.stringify(config, omitUndefined, 2)}\n`, "utf8");
  return config;
}

export async function loadConfig(configDir?: string): Promise<Config> {
  const cdir = configDir ?? path.join(process.cwd(), ".mini-agent");
  const raw = await readFile(configFilePath(cdir), "utf8");
  const parsed = JSON.parse(raw) as Partial<Config>;
  const defaults = defaultConfig(cdir);
  const merged: Config = {
    provider: {
      ...defaults.provider,
      ...parsed.provider
    },
    agent: {
      ...defaults.agent,
      ...parsed.agent
    },
    sessions: {
      ...defaults.sessions,
      ...parsed.sessions
    },
    ...(parsed.search ? { search: parsed.search } : {}),
    ...(parsed.exec ? { exec: parsed.exec } : {})
  };
  return parseConfig(merged, cdir);
}

export async function writeConfig(patch: ConfigPatch, configDir?: string): Promise<Config> {
  const cdir = configDir ?? path.join(process.cwd(), ".mini-agent");
  const current = await ensureDefaultConfig(cdir);
  const merged: Config = {
    ...current,
    provider: {
      ...current.provider,
      ...patch.provider
    },
    agent: {
      ...current.agent,
      ...patch.agent
    },
    sessions: {
      ...current.sessions
    },
    ...(current.search ? { search: current.search } : {}),
    ...(current.exec ? { exec: current.exec } : {})
  };

  if (patch.search) {
    merged.search = {
      backend: patch.search.backend ?? current.search?.backend ?? "none",
      maxResults: patch.search.maxResults ?? current.search?.maxResults ?? 5
    };
  }
  if (patch.exec) {
    merged.exec = {
      enabled: patch.exec.enabled ?? current.exec?.enabled ?? false,
      timeoutMs: patch.exec.timeoutMs ?? current.exec?.timeoutMs ?? 30_000,
      maxOutputChars: patch.exec.maxOutputChars ?? current.exec?.maxOutputChars ?? 32_000
    };
  }
  if (patch.provider?.apiKey === REDACTED_API_KEY) {
    merged.provider.apiKey = current.provider.apiKey;
  }

  const validated = parseConfig(merged, cdir);
  const file = configFilePath(cdir);
  const temp = `${file}.${process.pid}.tmp`;
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(temp, `${JSON.stringify(validated, omitUndefined, 2)}\n`, "utf8");
  await rename(temp, file);
  return validated;
}

export function configFilePath(configDir?: string): string {
  const cdir = configDir ?? path.join(process.cwd(), ".mini-agent");
  return path.join(cdir, "config.json");
}

function omitUndefined(_key: string, value: unknown): unknown {
  return value === undefined ? undefined : value;
}
