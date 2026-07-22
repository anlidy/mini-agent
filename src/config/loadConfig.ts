import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import type { AgentConfig, Config, ProviderConfig } from "./Config.js";
import { parseConfig } from "./schema.js";
import { resolveRuntimeHome } from "../runtime/paths.js";

export const REDACTED_API_KEY = "***";

export type ConfigPatch = Partial<Config>;

export function defaultConfig(configDir?: string): Config {
  const cdir = resolveRuntimeHome(configDir);
  return {
    agents: {
      default: {
        provider: "deepseek",
        model: "deepseek-chat",
        thinking: { enabled: false, budgetTokens: 16_000 },
        effort: 1,
        maxIterations: 100,
        maxToolResultChars: 64_000,
        contextWindowTokens: 32_000,
        outputReserveTokens: 4_096,
        params: {}
      }
    },
    providers: {
      deepseek: {
        type: "openai",
        baseUrl: "https://api.deepseek.com/v1",
        timeoutMs: 60_000
      }
    },
    sessions: {
      dir: path.join(cdir, "sessions"),
      maxHistoryMessages: 50,
      maxHistoryChars: 200_000
    },
    tools: {}
  };
}

export async function ensureDefaultConfig(configDir?: string): Promise<Config> {
  const cdir = resolveRuntimeHome(configDir);
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
  const cdir = resolveRuntimeHome(configDir);
  const raw = await readFile(configFilePath(cdir), "utf8");
  const parsed = JSON.parse(raw) as Partial<Config>;
  const defaults = defaultConfig(cdir);

  const merged: Config = {
    agents: deepMergeAgents(defaults.agents, parsed.agents),
    providers: { ...defaults.providers, ...parsed.providers },
    sessions: { ...defaults.sessions, ...parsed.sessions },
    tools: deepMergeTools(defaults.tools, parsed.tools)
  };

  return parseConfig(merged, cdir);
}

export async function writeConfig(patch: ConfigPatch, configDir?: string): Promise<Config> {
  const cdir = resolveRuntimeHome(configDir);
  const current = await ensureDefaultConfig(cdir);

  const merged: Config = {
    ...current,
    ...(patch.agents ? {
      agents: deepMergeAgents(current.agents, patch.agents)
    } : {}),
    ...(patch.providers ? {
      providers: applyProvidersPatch(current.providers, patch.providers)
    } : {}),
    ...(patch.sessions ? {
      sessions: { ...current.sessions, ...patch.sessions }
    } : {}),
    ...(patch.tools ? {
      tools: deepMergeTools(current.tools, patch.tools)
    } : {})
  };

  // Redact API keys: if patch providers have REDACTED_API_KEY, keep current keys.
  if (patch.providers) {
    for (const [key, providerPatch] of Object.entries(patch.providers)) {
      if (providerPatch.apiKey === REDACTED_API_KEY && merged.providers[key]) {
        merged.providers[key] = {
          ...merged.providers[key]!,
          apiKey: current.providers[key]?.apiKey
        };
      }
    }
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
  const cdir = resolveRuntimeHome(configDir);
  return path.join(cdir, "config.json");
}

/* ---- merging helpers ---- */

function deepMergeAgents(
  defaults: Record<string, AgentConfig>,
  overrides?: Record<string, Partial<AgentConfig>>
): Record<string, AgentConfig> {
  if (!overrides) return { ...defaults };
  const result = { ...defaults };
  for (const [key, override] of Object.entries(overrides)) {
    result[key] = { ...(result[key] ?? {}), ...override } as AgentConfig;
  }
  return result;
}

function deepMergeTools(
  defaults: Config["tools"],
  overrides?: Partial<Config["tools"]>
): Config["tools"] {
  if (!overrides) return { ...defaults };
  const mergedSearch = defaults.search || overrides.search
    ? { ...defaults.search, ...overrides.search } as Config["tools"]["search"]
    : undefined;
  const mergedExec = defaults.exec || overrides.exec
    ? { ...defaults.exec, ...overrides.exec } as Config["tools"]["exec"]
    : undefined;
  const result: Config["tools"] = {};
  if (mergedSearch) result.search = mergedSearch;
  if (mergedExec) result.exec = mergedExec;
  return result;
}

function applyProvidersPatch(
  current: Record<string, ProviderConfig>,
  patch?: Record<string, Partial<ProviderConfig>>
): Record<string, ProviderConfig> {
  if (!patch) return current;
  const result = { ...current };
  for (const [key, providerPatch] of Object.entries(patch)) {
    result[key] = { ...(result[key] ?? {}), ...providerPatch } as ProviderConfig;
  }
  return result;
}

function omitUndefined(_key: string, value: unknown): unknown {
  return value === undefined ? undefined : value;
}
