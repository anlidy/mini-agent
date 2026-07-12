import { describe, expect, it } from "vitest";

import { createAgent, version } from "../src/index.js";
import type { LLMProvider } from "../src/providers/Provider.js";

describe("package entrypoint", () => {
  it("exports the package version", () => {
    expect(version).toBe("0.1.0");
  });

  it("creates an agent with the direct run API", async () => {
    const provider: LLMProvider = {
      defaultModel: () => "test-model",
      async chat() {
        return {
          content: "hello from provider",
          reasoningContent: null,
          toolCalls: [],
          finishReason: "stop",
          usage: {}
        };
      }
    };
    const agent = createAgent({ workspace: "/tmp/mini-agent-test", maxIterations: 3, provider });

    const result = await agent.run("hello", { sessionKey: "test:default" });

    expect(result).toEqual({
      content: "hello from provider",
      sessionKey: "test:default",
      toolsUsed: [],
      usage: {}
    });
  });

  it("does not expose one-off migration helpers from the public entrypoint", async () => {
    const exports = await import("../src/index.js");
    expect("migrateSessions" in exports).toBe(false);
  });
});
