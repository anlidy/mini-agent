import path from "node:path";
import { describe, expect, it } from "vitest";

import { parseConfig, formatConfigError, ConfigValidationError } from "../../src/config/schema.js";
import { defaultConfig } from "../../src/config/loadConfig.js";

describe("config schema validation", () => {
  it("accepts the generated default config", () => {
    const workspace = "/tmp/ws";
    const parsed = parseConfig(defaultConfig(path.join(workspace, ".mini-agent")), workspace);
    expect(parsed.agents.default!.model).toBe("deepseek-chat");
    expect(parsed.agents.default!.maxIterations).toBe(100);
    expect(parsed.agents.default!.outputReserveTokens).toBe(4096);
  });

  it("fills defaults for omitted optional sections", () => {
    const parsed = parseConfig({
      providers: { deepseek: { type: "openai", apiKey: "sk-test" } },
      agents: { default: { provider: "deepseek", model: "deepseek-chat" } }
    }, "/tmp/ws");
    expect(parsed.providers.deepseek!.apiKey).toBe("sk-test");
    expect(parsed.agents.default!.maxIterations).toBeGreaterThan(0);
    expect(parsed.agents.default!.outputReserveTokens).toBe(4096);
    expect(parsed.sessions.maxHistoryMessages).toBe(50);
  });

  it("rejects wrong types with a readable aggregated message", () => {
    expect(() => parseConfig({ agents: { default: { maxIterations: "lots" } } }, "/tmp/ws"))
      .toThrow(ConfigValidationError);
    try {
      parseConfig({ agents: { default: { maxIterations: "lots" } } }, "/tmp/ws");
    } catch (error) {
      const message = formatConfigError(error);
      expect(message).toContain("agents.default.maxIterations");
    }
  });

  it("rejects negative numeric bounds", () => {
    expect(() => parseConfig({ agents: { default: { maxIterations: 0 } } }, "/tmp/ws"))
      .toThrow(ConfigValidationError);
  });

  it("rejects a non-string apiKey", () => {
    expect(() => parseConfig({ providers: { deepseek: { type: "openai", apiKey: 123 } } }, "/tmp/ws"))
      .toThrow(ConfigValidationError);
  });

  it("accepts an optional search backend block", () => {
    const parsed = parseConfig({
      providers: { deepseek: { type: "openai" } },
      agents: { default: { provider: "deepseek", model: "deepseek-chat" } },
      tools: { search: { backend: "duckduckgo", maxResults: 5 } }
    }, "/tmp/ws");
    expect(parsed.tools.search?.backend).toBe("duckduckgo");
    expect(parsed.tools.search?.maxResults).toBe(5);
  });

  it("rejects an unknown search backend", () => {
    expect(() => parseConfig({
      providers: { deepseek: { type: "openai" } },
      agents: { default: { provider: "deepseek", model: "deepseek-chat" } },
      tools: { search: { backend: "bing" } }
    }, "/tmp/ws")).toThrow(ConfigValidationError);
  });
});
