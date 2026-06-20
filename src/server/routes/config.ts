import type { Config } from "../../config/Config.js";
import { REDACTED_API_KEY, writeConfig, type ConfigPatch } from "../../config/loadConfig.js";
import { json, readJson, type HttpRouter } from "../httpRouter.js";

export interface ConfigState {
  config: Config;
  version: number;
  update(config: Config): void;
}

export function redactConfig(config: Config): Config {
  return {
    ...config,
    provider: {
      ...config.provider,
      ...(config.provider.apiKey ? { apiKey: REDACTED_API_KEY } : {})
    }
  };
}

export function registerConfigRoutes(router: HttpRouter, state: ConfigState): void {
  router.add("GET", "/api/config", async (_req, res) => {
    await json(res, redactConfig(state.config));
  });

  router.add("PUT", "/api/config", async (req, res) => {
    const patch = await readJson(req) as ConfigPatch;
    const updated = await writeConfig(patch, state.config.workspace);
    state.update(updated);
    await json(res, redactConfig(updated));
  });
}
