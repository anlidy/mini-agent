import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { AgentLoop } from "../../src/agent/AgentLoop.js";
import { defaultConfig } from "../../src/config/loadConfig.js";
import { OpenAIProvider } from "../../src/providers/OpenAIProvider.js";
import { ToolRegistry } from "../../src/tools/ToolRegistry.js";
import type { ChatRequest, LLMProvider, LLMResponse, ProviderStreamEvent } from "../../src/providers/Provider.js";
import type { AgentEvent } from "../../src/agent/events.js";
import { safeSessionFilename } from "../../src/session/SessionManager.js";
import { SessionManager } from "../../src/session/SessionManager.js";
import type { Session } from "../../src/session/Session.js";

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
    reasoningContent: null,
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
    const runtimeHome = path.join(workspace, "runtime");
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
    const agent = new AgentLoop({ workspace, runtimeHome, provider, sessionKey: "demo" });

    const first = await agent.run("read README.md");
    expect(first.content).toBe("README says project readme");
    expect(first.toolsUsed).toEqual(["read_file"]);

    const sessionPath = path.join(runtimeHome, "sessions", `${safeSessionFilename("demo")}.jsonl`);
    expect(await readFile(sessionPath, "utf8")).toContain("README says project readme");

    const second = await agent.run("what did you read?");
    expect(second.content).toBe("I remember the README.");
    expect(provider.requests[2]?.messages.some((message) => String(message.content).includes("README says project readme")))
      .toBe(true);
  });

  it("uses provider settings from config.jsonconfig.json when no provider is injected", async () => {
    const workspace = await mkdtemp(path.join(os.tmpdir(), "mini-agent-loop-config-"));
    const runtimeHome = path.join(workspace, "runtime");
    const config = defaultConfig(runtimeHome);
    config.providers.deepseek!.apiKey = "config-file-key";
    config.sessions.dir = path.join(runtimeHome, "ignored-custom-sessions");
    await mkdir(runtimeHome, { recursive: true });
    await writeFile(path.join(runtimeHome, "config.json"), `${JSON.stringify(config)}\n`, "utf8");
    const requests: ChatRequest[] = [];
    const apiKeys: string[] = [];
    vi.spyOn(OpenAIProvider.prototype, "chat").mockImplementation(async function(this: OpenAIProvider, request) {
      apiKeys.push((this as unknown as { apiKey: string }).apiKey);
      requests.push(request);
      return response({ content: "configured" });
    });

    const agent = new AgentLoop({ workspace, runtimeHome });
    const result = await agent.run("hello");

    expect(result.content).toBe("configured");
    expect(apiKeys).toEqual(["config-file-key"]);
    expect(requests[0]?.model).toBe("deepseek-chat");
    await expect(readFile(path.join(runtimeHome, "sessions", `${safeSessionFilename("default")}.jsonl`), "utf8")).resolves.toContain("configured");
  });

  it("fails fast with an actionable error when no API key is configured and no provider is injected", async () => {
    const workspace = await mkdtemp(path.join(os.tmpdir(), "mini-agent-loop-nokey-"));
    const runtimeHome = path.join(workspace, "runtime");
    const previous = process.env.MINI_AGENT_API_KEY;
    delete process.env.MINI_AGENT_API_KEY;
    try {
      const agent = new AgentLoop({ workspace, runtimeHome });
      await expect(agent.run("hello")).rejects.toThrow(/Missing provider API key/);
    } finally {
      if (previous !== undefined) {
        process.env.MINI_AGENT_API_KEY = previous;
      }
    }
  });

  it("reads the API key from the MINI_AGENT_API_KEY env var when config omits it", async () => {
    const workspace = await mkdtemp(path.join(os.tmpdir(), "mini-agent-loop-envkey-"));
    const runtimeHome = path.join(workspace, "runtime");
    const previous = process.env.MINI_AGENT_API_KEY;
    process.env.MINI_AGENT_API_KEY = "env-key";
    const apiKeys: string[] = [];
    vi.spyOn(OpenAIProvider.prototype, "chat").mockImplementation(async function(this: OpenAIProvider) {
      apiKeys.push((this as unknown as { apiKey: string }).apiKey);
      return response({ content: "ok" });
    });
    try {
      const agent = new AgentLoop({ workspace, runtimeHome });
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

  it("streams token and done events and persists the session", async () => {
    const workspace = await mkdtemp(path.join(os.tmpdir(), "mini-agent-loop-stream-"));
    const runtimeHome = path.join(workspace, "runtime");
    const provider: LLMProvider = {
      defaultModel: () => "stream-model",
      async chat(): Promise<LLMResponse> {
        throw new Error("chat should not be used while streaming");
      },
      async *chatStream(): AsyncIterable<ProviderStreamEvent> {
        yield { type: "delta", content: "Hel" };
        yield { type: "delta", content: "lo" };
        yield { type: "done", response: { content: "Hello", reasoningContent: null, toolCalls: [], finishReason: "stop", usage: {} } };
      }
    };
    const agent = new AgentLoop({ workspace, runtimeHome, provider, sessionKey: "stream" });

    const events: AgentEvent[] = [];
    for await (const event of agent.stream("hi")) {
      events.push(event);
    }

    expect(events.filter((event) => event.type === "token").map((event) => (event as { text: string }).text))
      .toEqual(["Hel", "lo"]);
    expect(events.at(-1)?.type).toBe("done");

    const sessionPath = path.join(runtimeHome, "sessions", `${safeSessionFilename("stream")}.jsonl`);
    await expect(readFile(sessionPath, "utf8")).resolves.toContain("Hello");
  });

  it("re-reads maxIterations from config.json each turn instead of snapshotting it", async () => {
    // Regression: the CLI used to pass config.agent.maxIterations into the
    // AgentLoop constructor, which froze it for the whole process. prepare()'s
    // `this.maxIterations ?? config.agent.maxIterations` then ignored any later
    // edits to config.json. When no constructor value is given, prepare() must
    // pick up the on-disk value on every run.
    const workspace = await mkdtemp(path.join(os.tmpdir(), "mini-agent-loop-iter-"));
    const runtimeHome = path.join(workspace, "runtime");
    await mkdir(runtimeHome, { recursive: true });
    const configPath = path.join(runtimeHome, "config.json");
    const writeMaxIterations = async (maxIterations: number): Promise<void> => {
      const config = defaultConfig(runtimeHome);
      config.providers.deepseek!.apiKey = "k";
      config.agents.default!.maxIterations = maxIterations;
      await writeFile(configPath, `${JSON.stringify(config)}\n`, "utf8");
    };

    // A provider that always asks for a tool call, so the loop only ends when it
    // hits maxIterations. The tool is unregistered, so execute() returns an error
    // string (never throws) and the loop keeps going until the cap.
    let calls = 0;
    const provider: LLMProvider = {
      defaultModel: () => "loop-model",
      async chat(): Promise<LLMResponse> {
        calls += 1;
        return response({
          finishReason: "tool_calls",
          toolCalls: [{ id: `call_${calls}`, name: "missing_tool", arguments: {} }]
        });
      }
    };

    // No maxIterations in the constructor -> prepare() must read it from config.
    const agent = new AgentLoop({ workspace, runtimeHome, provider, tools: new ToolRegistry(), sessionKey: "iter" });

    await writeMaxIterations(2);
    const first = await agent.run("go");
    expect(first.content).toBe("Maximum tool iterations reached.");
    expect(calls).toBe(2);

    // Editing config between turns must change the cap on the very next run.
    calls = 0;
    await writeMaxIterations(4);
    const second = await agent.run("go again");
    expect(second.content).toBe("Maximum tool iterations reached.");
    expect(calls).toBe(4);
  });

  it("does not persist provider errors or aborted turns", async () => {
    const workspace = await mkdtemp(path.join(os.tmpdir(), "mini-agent-loop-failure-"));
    const runtimeHome = path.join(workspace, "runtime");
    const sessions = new SessionManager({ sessionsDir: path.join(runtimeHome, "sessions") });
    const failing: LLMProvider = {
      defaultModel: () => "fail",
      async chat() { throw new Error("provider down"); }
    };
    const failed = new AgentLoop({ workspace, runtimeHome, sessions, provider: failing, sessionKey: "failed" });
    await expect(failed.run("do not save")).rejects.toThrow("provider down");
    expect(await sessions.get("failed")).toBeUndefined();

    const controller = new AbortController();
    controller.abort();
    const aborted = new AgentLoop({ workspace, runtimeHome, sessions, provider: new ScriptedProvider([response({ content: "unused" })]), sessionKey: "aborted" });
    await expect(aborted.run("do not save", { signal: controller.signal })).rejects.toThrow("Run aborted");
    expect(await sessions.get("aborted")).toBeUndefined();
  });

  it("emits one terminal error and no done when saving fails", async () => {
    class FailingSaveManager extends SessionManager {
      override async save(_snapshot: Session): Promise<Session> {
        throw new Error("disk full");
      }
    }
    const workspace = await mkdtemp(path.join(os.tmpdir(), "mini-agent-loop-save-error-"));
    const sessions = new FailingSaveManager({ sessionsDir: path.join(workspace, "runtime", "sessions") });
    const agent = new AgentLoop({ workspace, runtimeHome: path.join(workspace, "runtime"), sessions, provider: new ScriptedProvider([response({ content: "answer" })]) });
    const events: AgentEvent[] = [];
    for await (const event of agent.stream("hello")) events.push(event);
    expect(events.filter((event) => event.type === "error")).toHaveLength(1);
    expect(events.some((event) => event.type === "done")).toBe(false);
    expect(events.at(-1)).toMatchObject({ type: "error", error: "disk full" });
  });

  it("rejects overlapping turns for one session while allowing the first to commit", async () => {
    const workspace = await mkdtemp(path.join(os.tmpdir(), "mini-agent-loop-busy-"));
    const runtimeHome = path.join(workspace, "runtime");
    const sessions = new SessionManager({ sessionsDir: path.join(runtimeHome, "sessions") });
    let release!: () => void;
    let started!: () => void;
    const startedPromise = new Promise<void>((resolve) => { started = resolve; });
    const wait = new Promise<void>((resolve) => { release = resolve; });
    const slow: LLMProvider = {
      defaultModel: () => "slow",
      async chat() {
        started();
        await wait;
        return response({ content: "first" });
      }
    };
    const first = new AgentLoop({ workspace, runtimeHome, sessions, provider: slow, sessionKey: "shared" });
    const second = new AgentLoop({ workspace, runtimeHome, sessions, provider: new ScriptedProvider([response({ content: "second" })]), sessionKey: "shared" });
    const firstRun = first.run("one");
    await startedPromise;
    const events: AgentEvent[] = [];
    for await (const event of second.stream("two")) events.push(event);
    expect(events).toEqual([expect.objectContaining({ type: "error", code: "session_busy" })]);
    release();
    await expect(firstRun).resolves.toMatchObject({ content: "first" });
    expect((await sessions.get("shared"))?.messages.map((message) => message.content)).toEqual(["one", "first"]);
  });


  it("saves finished tool steps when a turn is interrupted and tells the next turn", async () => {
    const workspace = await mkdtemp(path.join(os.tmpdir(), "mini-agent-loop-interrupt-"));
    const runtimeHome = path.join(workspace, "runtime");
    const sessions = new SessionManager({ sessionsDir: path.join(runtimeHome, "sessions") });
    const controller = new AbortController();
    const tools = new ToolRegistry();
    tools.register({
      name: "edit",
      description: "Edits a file, then the user hits stop.",
      parameters: { type: "object", properties: {} },
      async execute() {
        controller.abort();
        return "edited a.ts";
      }
    });
    const provider = new ScriptedProvider([
      response({ content: "Editing.", toolCalls: [{ id: "call_1", name: "edit", arguments: {} }], finishReason: "tool_calls" })
    ]);
    const agent = new AgentLoop({ workspace, runtimeHome, sessions, provider, tools, sessionKey: "interrupted" });

    const events: AgentEvent[] = [];
    for await (const event of agent.stream("fix a.ts", { signal: controller.signal })) events.push(event);

    expect(events.some((event) => event.type === "done")).toBe(false);
    expect(events.at(-1)).toMatchObject({ type: "error", code: "turn_aborted" });
    const saved = await sessions.get("interrupted");
    expect(saved?.messages.map((message) => [message.role, message.content, message.interrupted])).toEqual([
      ["user", "fix a.ts", undefined],
      ["assistant", "Editing.", undefined],
      ["tool", "edited a.ts", undefined],
      ["assistant", "", "user"]
    ]);
    const history = sessions.getHistory(saved!, { maxMessages: 50 });
    expect(String(history.at(-1)?.content)).toContain("interrupted");
  });

  it("saves finished tool steps when the provider fails mid-turn", async () => {
    const workspace = await mkdtemp(path.join(os.tmpdir(), "mini-agent-loop-midfail-"));
    const runtimeHome = path.join(workspace, "runtime");
    const sessions = new SessionManager({ sessionsDir: path.join(runtimeHome, "sessions") });
    const tools = new ToolRegistry();
    tools.register({
      name: "edit",
      description: "Edits a file.",
      parameters: { type: "object", properties: {} },
      async execute() {
        return "edited a.ts";
      }
    });
    let calls = 0;
    const provider: LLMProvider = {
      defaultModel: () => "flaky",
      async chat() {
        calls += 1;
        if (calls === 1) {
          return response({ toolCalls: [{ id: "call_1", name: "edit", arguments: {} }], finishReason: "tool_calls" });
        }
        throw new Error("provider down");
      }
    };
    const agent = new AgentLoop({ workspace, runtimeHome, sessions, provider, tools, sessionKey: "midfail" });

    await expect(agent.run("fix a.ts")).rejects.toThrow("provider down");
    const saved = await sessions.get("midfail");
    expect(saved?.messages.at(-2)).toMatchObject({ role: "tool", content: "edited a.ts" });
    expect(saved?.messages.at(-1)).toMatchObject({
      role: "assistant",
      content: expect.stringContaining("provider down"),
      interrupted: "error"
    });
  });
});
