import { describe, expect, it } from "vitest";

import { parseConfig, formatConfigError, ConfigValidationError } from "../../src/config/schema.js";
import { defaultConfig } from "../../src/config/loadConfig.js";

describe("config schema validation", () => {
  it("accepts the generated default config", () => {
    const workspace = "/tmp/ws";
    const parsed = parseConfig(defaultConfig(workspace), workspace);
    expect(parsed.provider.model).toBe("deepseek-chat");
    expect(parsed.agent.maxIterations).toBe(100);
  });

  it("fills defaults for omitted optional sections", () => {
    const parsed = parseConfig({ provider: { apiKey: "sk-test" } }, "/tmp/ws");
    expect(parsed.workspace).toBe("/tmp/ws");
    expect(parsed.provider.apiKey).toBe("sk-test");
    expect(parsed.agent.maxIterations).toBeGreaterThan(0);
    expect(parsed.sessions.defaultKey).toBe("default");
  });

  it("rejects wrong types with a readable aggregated message", () => {
    expect(() => parseConfig({ agent: { maxIterations: "lots" } }, "/tmp/ws"))
      .toThrow(ConfigValidationError);
    try {
      parseConfig({ agent: { maxIterations: "lots" } }, "/tmp/ws");
    } catch (error) {
      const message = formatConfigError(error);
      expect(message).toContain("agent.maxIterations");
    }
  });

  it("rejects negative numeric bounds", () => {
    expect(() => parseConfig({ agent: { maxIterations: 0 } }, "/tmp/ws"))
      .toThrow(ConfigValidationError);
  });

  it("rejects a non-string apiKey", () => {
    expect(() => parseConfig({ provider: { apiKey: 123 } }, "/tmp/ws"))
      .toThrow(ConfigValidationError);
  });

  it("accepts an optional search backend block", () => {
    const parsed = parseConfig({ search: { backend: "duckduckgo", maxResults: 5 } }, "/tmp/ws");
    expect(parsed.search?.backend).toBe("duckduckgo");
    expect(parsed.search?.maxResults).toBe(5);
  });

  it("rejects an unknown search backend", () => {
    expect(() => parseConfig({ search: { backend: "bing" } }, "/tmp/ws"))
      .toThrow(ConfigValidationError);
  });
});
