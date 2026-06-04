import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { ContextBuilder } from "../../src/agent/ContextBuilder.js";

describe("ContextBuilder", () => {
  it("builds system prompt, workspace bootstrap, history, and runtime metadata", async () => {
    const workspace = await mkdtemp(path.join(os.tmpdir(), "mini-agent-context-"));
    await writeFile(path.join(workspace, "AGENTS.md"), "Follow workspace rules.");

    const builder = new ContextBuilder({ workspace });
    const messages = await builder.buildMessages({
      input: "what now?",
      sessionKey: "demo",
      history: [{ role: "assistant", content: "previous answer" }],
      skillsSummary: "No skills installed."
    });

    expect(messages[0]).toMatchObject({ role: "system" });
    expect(String(messages[0]?.content)).toContain("TypeScript mini-agent");
    expect(String(messages[0]?.content)).toContain("Follow workspace rules.");
    expect(String(messages[0]?.content)).toContain("No skills installed.");
    expect(String(messages[0]?.content)).toContain("When the user asks to inspect, read, write, list, find, or search workspace files, use the file/search tools.");
    expect(messages.at(-1)).toMatchObject({ role: "user" });
    expect(String(messages.at(-1)?.content)).toContain("what now?");
    expect(String(messages.at(-1)?.content)).toContain("<runtime_context>");
    expect(messages).toContainEqual({ role: "assistant", content: "previous answer" });
  });
});
