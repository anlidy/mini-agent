import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import type { Config } from "./Config.js";
import { parseConfig } from "./schema.js";

export function defaultConfig(workspace = process.cwd()): Config {
  return {
    workspace,
    provider: {
      name: "deepseek",
      baseUrl: "https://api.deepseek.com/v1",
      model: "deepseek-chat",
      timeoutMs: 60_000
    },
    agent: {
      maxIterations: 10,
      maxToolResultChars: 64_000,
      contextWindowTokens: 32_000
    },
    sessions: {
      dir: path.join(workspace, ".mini-agent", "workspace", "sessions"),
      defaultKey: "default",
      maxHistoryMessages: 50,
      maxHistoryChars: 200_000
    }
  };
}

export async function ensureDefaultConfig(workspace = process.cwd()): Promise<Config> {
  const configPath = configFilePath(workspace);
  try {
    return await loadConfig(workspace);
  } catch (error) {
    if (!(error && typeof error === "object" && "code" in error && error.code === "ENOENT")) {
      throw error;
    }
  }

  const config = defaultConfig(workspace);
  await mkdir(path.dirname(configPath), { recursive: true });
  await writeFile(configPath, `${JSON.stringify(config, omitUndefined, 2)}\n`, "utf8");
  return config;
}

export async function loadConfig(workspace = process.cwd()): Promise<Config> {
  const raw = await readFile(configFilePath(workspace), "utf8");
  const parsed = JSON.parse(raw) as Partial<Config>;
  const defaults = defaultConfig(workspace);
  const merged: Config = {
    workspace: parsed.workspace ?? workspace,
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
  return parseConfig(merged, workspace);
}

export function configFilePath(workspace = process.cwd()): string {
  return path.join(workspace, ".mini-agent", "config.json");
}

function omitUndefined(_key: string, value: unknown): unknown {
  return value === undefined ? undefined : value;
}
