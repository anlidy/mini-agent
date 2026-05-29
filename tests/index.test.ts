import { describe, expect, it } from "vitest";

import { createAgent, version } from "../src/index.js";

describe("package entrypoint", () => {
  it("exports the package version", () => {
    expect(version).toBe("0.1.0");
  });

  it("creates an agent with the direct run API", async () => {
    const agent = createAgent({ workspace: "/tmp/mini-agent-test", maxIterations: 3 });

    const result = await agent.run("hello", { sessionKey: "test:default" });

    expect(result).toEqual({
      content: "hello",
      sessionKey: "test:default",
      toolsUsed: []
    });
  });
});
