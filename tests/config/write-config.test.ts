import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { defaultConfig, REDACTED_API_KEY, writeConfig } from "../../src/config/loadConfig.js";

describe("writeConfig", () => {
  it("writes a validated config patch atomically and preserves redacted API keys", async () => {
    const workspace = await mkdtemp(path.join(os.tmpdir(), "mini-agent-write-config-"));
    const config = defaultConfig(workspace);
    config.provider.apiKey = "real-key";
    await mkdir(path.join(workspace, ".mini-agent"), { recursive: true });
    await writeFile(path.join(workspace, ".mini-agent", "config.json"), `${JSON.stringify(config, null, 2)}\n`, "utf8");

    const updated = await writeConfig({
      provider: {
        apiKey: REDACTED_API_KEY,
        model: "new-model",
        timeoutMs: 1234
      },
      agent: {
        maxIterations: 7,
        maxToolResultChars: 2048,
        contextWindowTokens: 4096
      },
      exec: {
        enabled: true,
        timeoutMs: 5000,
        maxOutputChars: 9000
      }
    }, workspace);

    expect(updated.provider.apiKey).toBe("real-key");
    expect(updated.provider.model).toBe("new-model");
    expect(updated.agent.maxIterations).toBe(7);
    expect(updated.exec?.enabled).toBe(true);

    const raw = await readFile(path.join(workspace, ".mini-agent", "config.json"), "utf8");
    expect(raw).toContain("real-key");
    expect(raw).not.toContain(REDACTED_API_KEY);
  });

  it("rejects invalid config patches without changing the existing file", async () => {
    const workspace = await mkdtemp(path.join(os.tmpdir(), "mini-agent-write-config-invalid-"));
    const config = defaultConfig(workspace);
    await mkdir(path.join(workspace, ".mini-agent"), { recursive: true });
    const configPath = path.join(workspace, ".mini-agent", "config.json");
    await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
    const before = await readFile(configPath, "utf8");

    await expect(writeConfig({ agent: { maxIterations: 0 } }, workspace)).rejects.toThrow(/Invalid/);

    await expect(readFile(configPath, "utf8")).resolves.toBe(before);
  });
});
