import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { ensureDefaultConfig, loadConfig } from "../../src/config/loadConfig.js";

describe("config loading", () => {
  it("creates and loads default DeepSeek config without writing an API key", async () => {
    const workspace = await mkdtemp(path.join(os.tmpdir(), "mini-agent-config-"));
    const config = await ensureDefaultConfig(path.join(workspace, ".mini-agent"));

    expect(config.providers.deepseek).toMatchObject({
      baseUrl: "https://api.deepseek.com/v1"
    });
    expect(config.agents.default!.model).toBe("deepseek-chat");
    expect(config.providers.deepseek!.apiKey).toBeUndefined();

    const configPath = path.join(workspace, ".mini-agent", "config.json");
    const raw = await readFile(configPath, "utf8");
    expect(raw).toContain("deepseek-chat");
    expect(raw).not.toContain("apiKey");
    await expect(loadConfig(path.join(workspace, ".mini-agent"))).resolves.toEqual(config);
  });
});
