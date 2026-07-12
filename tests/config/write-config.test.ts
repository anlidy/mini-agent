import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { defaultConfig, REDACTED_API_KEY, writeConfig } from "../../src/config/loadConfig.js";

describe("writeConfig", () => {
  it("writes a validated config patch atomically and preserves redacted API keys", async () => {
    const workspace = await mkdtemp(path.join(os.tmpdir(), "mini-agent-write-config-"));
    const configDir = path.join(workspace, ".mini-agent");
    const config = defaultConfig(configDir);
    config.providers.deepseek!.apiKey = "real-key";
    await mkdir(configDir, { recursive: true });
    await writeFile(path.join(configDir, "config.json"), `${JSON.stringify(config, null, 2)}\n`, "utf8");

    const updated = await writeConfig({
      providers: {
        deepseek: {
          type: "openai",
          apiKey: REDACTED_API_KEY,
          timeoutMs: 1234
        }
      },
      agents: {
        default: {
          provider: "deepseek",
          model: "new-model",
          thinking: { enabled: false, budgetTokens: 16_000 },
          effort: 1,
          maxIterations: 7,
          maxToolResultChars: 2048,
          contextWindowTokens: 4096,
          params: {}
        }
      },
      tools: {
        exec: {
          enabled: true,
          timeoutMs: 5000,
          maxOutputChars: 9000
        }
      }
    }, configDir);

    expect(updated.providers.deepseek!.apiKey).toBe("real-key");
    expect(updated.agents.default!.model).toBe("new-model");
    expect(updated.agents.default!.maxIterations).toBe(7);
    expect(updated.tools.exec?.enabled).toBe(true);

    const raw = await readFile(path.join(configDir, "config.json"), "utf8");
    expect(raw).toContain("real-key");
    expect(raw).not.toContain(REDACTED_API_KEY);
  });

  it("rejects invalid config patches without changing the existing file", async () => {
    const workspace = await mkdtemp(path.join(os.tmpdir(), "mini-agent-write-config-invalid-"));
    const configDir = path.join(workspace, ".mini-agent");
    const config = defaultConfig(configDir);
    await mkdir(configDir, { recursive: true });
    const configPath = path.join(configDir, "config.json");
    await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
    const before = await readFile(configPath, "utf8");

    await expect(writeConfig({
      agents: {
        default: {
          provider: "deepseek",
          model: "deepseek-chat",
          thinking: { enabled: false, budgetTokens: 16_000 },
          effort: 1,
          maxIterations: 0,
          maxToolResultChars: 64_000,
          params: {}
        }
      }
    }, configDir)).rejects.toThrow(/Invalid/);

    await expect(readFile(configPath, "utf8")).resolves.toBe(before);
  });
});
