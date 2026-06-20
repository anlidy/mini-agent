import { describe, expect, it } from "vitest";

import { AgentRunner } from "../../src/agent/AgentRunner.js";
import type { AgentEvent } from "../../src/agent/events.js";
import type { ChatRequest, LLMProvider, LLMResponse, ProviderStreamEvent } from "../../src/providers/Provider.js";
import { ToolRegistry } from "../../src/tools/ToolRegistry.js";

/** Provider that streams scripted events for each chatStream call. */
class StreamingProvider implements LLMProvider {
  readonly requests: ChatRequest[] = [];

  constructor(private readonly scripts: ProviderStreamEvent[][]) {}

  defaultModel(): string {
    return "stream-model";
  }

  async chat(): Promise<LLMResponse> {
    throw new Error("chat should not be called when chatStream is available");
  }

  async *chatStream(request: ChatRequest): AsyncIterable<ProviderStreamEvent> {
    this.requests.push(request);
    const script = this.scripts.shift();
    if (!script) {
      throw new Error("No scripted stream");
    }
    for (const event of script) {
      yield event;
    }
  }
}

/** Provider with no chatStream — exercises the non-streaming fallback path. */
class NonStreamingProvider implements LLMProvider {
  constructor(private readonly responses: LLMResponse[]) {}
  defaultModel(): string {
    return "plain-model";
  }
  async chat(): Promise<LLMResponse> {
    const next = this.responses.shift();
    if (!next) {
      throw new Error("No scripted response");
    }
    return next;
  }
}

function llmResponse(partial: Partial<LLMResponse>): LLMResponse {
  return { content: null, toolCalls: [], finishReason: "stop", usage: {}, ...partial };
}

function makeRegistry(): ToolRegistry {
  const registry = new ToolRegistry();
  registry.register({
    name: "echo",
    description: "Echoes its input.",
    parameters: { type: "object", properties: { value: { type: "string" } }, required: ["value"] },
    async execute(args) {
      return `echo:${String(args.value)}`;
    }
  });
  return registry;
}

async function collect(iterable: AsyncIterable<AgentEvent>): Promise<AgentEvent[]> {
  const events: AgentEvent[] = [];
  for await (const event of iterable) {
    events.push(event);
  }
  return events;
}

describe("AgentRunner.runStream", () => {
  it("emits token events as content streams, then a terminal done", async () => {
    const provider = new StreamingProvider([
      [
        { type: "delta", content: "Hel" },
        { type: "delta", content: "lo" },
        { type: "done", response: llmResponse({ content: "Hello", usage: { total_tokens: 3 } }) }
      ]
    ]);
    const runner = new AgentRunner(provider);

    const events = await collect(runner.runStream({
      initialMessages: [{ role: "user", content: "hi" }],
      tools: makeRegistry(),
      model: "stream-model",
      maxIterations: 3,
      maxToolResultChars: 1000,
      workspace: "/tmp/ws"
    }));

    expect(events.filter((event) => event.type === "token").map((event) => (event as { text: string }).text))
      .toEqual(["Hel", "lo"]);
    const done = events.at(-1);
    expect(done?.type).toBe("done");
    expect(done && done.type === "done" && done.result.finalContent).toBe("Hello");
    expect(done && done.type === "done" && done.result.stopReason).toBe("completed");
  });

  it("emits tool_call and tool_result events around tool execution", async () => {
    const provider = new StreamingProvider([
      [
        {
          type: "done",
          response: llmResponse({
            finishReason: "tool_calls",
            toolCalls: [{ id: "call_1", name: "echo", arguments: { value: "hey" } }]
          })
        }
      ],
      [
        { type: "delta", content: "done" },
        { type: "done", response: llmResponse({ content: "done" }) }
      ]
    ]);
    const runner = new AgentRunner(provider);

    const events = await collect(runner.runStream({
      initialMessages: [{ role: "user", content: "echo hey" }],
      tools: makeRegistry(),
      model: "stream-model",
      maxIterations: 3,
      maxToolResultChars: 1000,
      workspace: "/tmp/ws"
    }));

    const toolCall = events.find((event) => event.type === "tool_call");
    const toolResult = events.find((event) => event.type === "tool_result");
    expect(toolCall).toEqual({ type: "tool_call", id: "call_1", name: "echo", arguments: { value: "hey" } });
    expect(toolResult).toEqual({ type: "tool_result", id: "call_1", name: "echo", status: "ok", content: "echo:hey" });
    expect(events.at(-1)?.type).toBe("done");
  });

  it("falls back to chat() for providers without chatStream (no token events)", async () => {
    const provider = new NonStreamingProvider([llmResponse({ content: "plain answer" })]);
    const runner = new AgentRunner(provider);

    const events = await collect(runner.runStream({
      initialMessages: [{ role: "user", content: "hi" }],
      tools: makeRegistry(),
      model: "plain-model",
      maxIterations: 3,
      maxToolResultChars: 1000,
      workspace: "/tmp/ws"
    }));

    expect(events.some((event) => event.type === "token")).toBe(false);
    const done = events.at(-1);
    expect(done && done.type === "done" && done.result.finalContent).toBe("plain answer");
  });

  it("emits an error event then done when the provider fails", async () => {
    const provider: LLMProvider = {
      defaultModel: () => "x",
      async chat() {
        throw new Error("boom");
      }
    };
    const runner = new AgentRunner(provider);

    const events = await collect(runner.runStream({
      initialMessages: [{ role: "user", content: "hi" }],
      tools: makeRegistry(),
      model: "x",
      maxIterations: 3,
      maxToolResultChars: 1000,
      workspace: "/tmp/ws"
    }));

    expect(events.some((event) => event.type === "error")).toBe(true);
    const done = events.at(-1);
    expect(done && done.type === "done" && done.result.stopReason).toBe("error");
  });
});
