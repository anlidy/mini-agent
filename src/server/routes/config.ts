import type { Config } from "../../config/Config.js";
import { REDACTED_API_KEY, writeConfig, type ConfigPatch } from "../../config/loadConfig.js";
import { json, readJson, type HttpRouter } from "../httpRouter.js";

export interface ConfigState {
  config: Config;
  version: number;
  workspace: string;
  update(config: Config): void;
}

/** Redact all provider API keys in the config for safe transport to the client. */
export function redactConfig(config: Config): Config {
  const redactedProviders: Record<string, typeof config.providers[string]> = {};
  for (const [key, provider] of Object.entries(config.providers)) {
    redactedProviders[key] = {
      ...provider,
      ...(provider.apiKey ? { apiKey: REDACTED_API_KEY } : {})
    };
  }
  return {
    ...config,
    providers: redactedProviders
  };
}

export function registerConfigRoutes(router: HttpRouter, state: ConfigState): void {
  router.add("GET", "/api/config", async (_req, res) => {
    await json(res, redactConfig(state.config));
  });

  router.add("PUT", "/api/config", async (req, res) => {
    const patch = await readJson(req) as ConfigPatch;
    const updated = await writeConfig(patch, state.workspace);
    state.update(updated);
    await json(res, redactConfig(updated));
  });
}
