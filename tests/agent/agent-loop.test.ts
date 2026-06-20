import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { AgentLoop } from "../../src/agent/AgentLoop.js";
import { defaultConfig } from "../../src/config/loadConfig.js";
import { OpenAIProvider } from "../../src/providers/OpenAIProvider.js";
import type { ChatRequest, LLMProvider, LLMResponse } from "../../src/providers/Provider.js";

class ScriptedProvider implements LLMProvider {
  readonly requests: ChatRequest[] = [];

  constructor(private readonly responses: LLMResponse[]) {}

  defaultModel(): string {
    return "scripted-model";
  }

  async chat(request: ChatRequest): Promise<LLMResponse> {
    this.requests.push(request);
    const response = this.responses.shift();
    if (!response) {
      throw new Error("No scripted response");
    }
    return response;
  }
}

function response(partial: Partial<LLMResponse>): LLMResponse {
  return {
    content: null,
    toolCalls: [],
    finishReason: "stop",
    usage: {},
    ...partial
  };
}

describe("AgentLoop", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("runs provider, executes tools, saves JSONL session, and resumes history", async () => {
    const workspace = await mkdtemp(path.join(os.tmpdir(), "mini-agent-loop-"));
    await readFile(path.join(workspace, "README.md")).catch(async () => {
      await import("node:fs/promises").then((fs) => fs.writeFile(path.join(workspace, "README.md"), "project readme"));
    });

    const provider = new ScriptedProvider([
      response({
        finishReason: "tool_calls",
        toolCalls: [{ id: "call_1", name: "read_file", arguments: { path: "README.md" } }]
      }),
      response({ content: "README says project readme" }),
      response({ content: "I remember the README." })
    ]);
    const agent = new AgentLoop({ workspace, provider, sessionKey: "demo" });

    const first = await agent.run("read README.md");
    expect(first.content).toBe("README says project readme");
    expect(first.toolsUsed).toEqual(["read_file"]);

    const sessionPath = path.join(workspace, ".mini-agent", "workspace", "sessions", "demo.jsonl");
    expect(await readFile(sessionPath, "utf8")).toContain("README says project readme");

    const second = await agent.run("what did you read?");
    expect(second.content).toBe("I remember the README.");
    expect(provider.requests[2]?.messages.some((message) => String(message.content).includes("README says project readme")))
      .toBe(true);
  });

  it("uses provider settings from .mini-agent/config.json when no provider is injected", async () => {
    const workspace = await mkdtemp(path.join(os.tmpdir(), "mini-agent-loop-config-"));
    const config = defaultConfig(workspace);
    config.provider.apiKey = "config-file-key";
    config.sessions.dir = path.join(workspace, ".mini-agent", "custom-sessions");
    await mkdir(path.join(workspace, ".mini-agent"), { recursive: true });
    await writeFile(path.join(workspace, ".mini-agent", "config.json"), `${JSON.stringify(config)}\n`, "utf8");
    const requests: ChatRequest[] = [];
    const apiKeys: string[] = [];
    vi.spyOn(OpenAIProvider.prototype, "chat").mockImplementation(async function(this: OpenAIProvider, request) {
      apiKeys.push((this as unknown as { apiKey: string }).apiKey);
      requests.push(request);
      return response({ content: "configured" });
    });

    const agent = new AgentLoop({ workspace });
    const result = await agent.run("hello");

    expect(result.content).toBe("configured");
    expect(apiKeys).toEqual(["config-file-key"]);
    expect(requests[0]?.model).toBe("deepseek-chat");
    await expect(readFile(path.join(config.sessions.dir, "default.jsonl"), "utf8")).resolves.toContain("configured");
  });

  it("fails fast with an actionable error when no API key is configured and no provider is injected", async () => {
    const workspace = await mkdtemp(path.join(os.tmpdir(), "mini-agent-loop-nokey-"));
    const previous = process.env.MINI_AGENT_API_KEY;
    delete process.env.MINI_AGENT_API_KEY;
    try {
      const agent = new AgentLoop({ workspace });
      await expect(agent.run("hello")).rejects.toThrow(/Missing provider API key/);
    } finally {
      if (previous !== undefined) {
        process.env.MINI_AGENT_API_KEY = previous;
      }
    }
  });

  it("reads the API key from the MINI_AGENT_API_KEY env var when config omits it", async () => {
    const workspace = await mkdtemp(path.join(os.tmpdir(), "mini-agent-loop-envkey-"));
    const previous = process.env.MINI_AGENT_API_KEY;
    process.env.MINI_AGENT_API_KEY = "env-key";
    const apiKeys: string[] = [];
    vi.spyOn(OpenAIProvider.prototype, "chat").mockImplementation(async function(this: OpenAIProvider) {
      apiKeys.push((this as unknown as { apiKey: string }).apiKey);
      return response({ content: "ok" });
    });
    try {
      const agent = new AgentLoop({ workspace });
      const result = await agent.run("hello");
      expect(result.content).toBe("ok");
      expect(apiKeys).toEqual(["env-key"]);
    } finally {
      if (previous === undefined) {
        delete process.env.MINI_AGENT_API_KEY;
      } else {
        process.env.MINI_AGENT_API_KEY = previous;
      }
    }
  });
});
