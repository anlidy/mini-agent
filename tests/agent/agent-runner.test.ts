import { describe, expect, it } from "vitest";

import { AgentHook, type AgentHookContext } from "../../src/agent/hooks.js";
import { AgentRunner } from "../../src/agent/AgentRunner.js";
import type { ChatRequest, LLMProvider, LLMResponse } from "../../src/providers/Provider.js";
import { ToolRegistry } from "../../src/tools/ToolRegistry.js";

class ScriptedProvider implements LLMProvider {
  readonly requests: ChatRequest[] = [];

  constructor(private readonly responses: LLMResponse[]) {}

  defaultModel(): string {
    return "test-model";
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

function makeRegistry(): ToolRegistry {
  const registry = new ToolRegistry();
  registry.register({
    name: "add",
    description: "Adds two numbers.",
    parameters: {
      type: "object",
      properties: {
        a: { type: "number" },
        b: { type: "number" }
      },
      required: ["a", "b"]
    },
    async execute(args) {
      return String(Number(args.a) + Number(args.b));
    }
  });
  return registry;
}

describe("AgentRunner", () => {
  it("returns a direct final assistant response without executing tools", async () => {
    const provider = new ScriptedProvider([
      response({ content: "done", usage: { prompt_tokens: 3, completion_tokens: 2 } })
    ]);
    const runner = new AgentRunner(provider);

    const result = await runner.run({
      initialMessages: [{ role: "user", content: "hello" }],
      tools: makeRegistry(),
      model: "test-model",
      maxIterations: 3,
      maxToolResultChars: 1000,
      workspace: "/tmp/workspace"
    });

    expect(result).toMatchObject({
      finalContent: "done",
      toolsUsed: [],
      stopReason: "completed",
      usage: { prompt_tokens: 3, completion_tokens: 2 }
    });
    expect(result.messages).toEqual([
      { role: "user", content: "hello" },
      { role: "assistant", content: "done" }
    ]);
    expect(provider.requests[0]?.tools).toEqual(makeRegistry().getDefinitions());
  });

  it("executes tool calls, appends tool results, and continues to final response", async () => {
    const provider = new ScriptedProvider([
      response({
        content: "",
        finishReason: "tool_calls",
        toolCalls: [{ id: "call_1", name: "add", arguments: { a: "2", b: 3 } }],
        usage: { prompt_tokens: 4 }
      }),
      response({ content: "2 + 3 = 5", usage: { completion_tokens: 5 } })
    ]);
    const runner = new AgentRunner(provider);

    const result = await runner.run({
      initialMessages: [{ role: "user", content: "add numbers" }],
      tools: makeRegistry(),
      model: "test-model",
      maxIterations: 3,
      maxToolResultChars: 1000,
      workspace: "/tmp/workspace"
    });

    expect(result.finalContent).toBe("2 + 3 = 5");
    expect(result.toolsUsed).toEqual(["add"]);
    expect(result.usage).toEqual({ prompt_tokens: 4, completion_tokens: 5 });
    expect(result.messages).toEqual([
      { role: "user", content: "add numbers" },
      {
        role: "assistant",
        content: "",
        tool_calls: [
          {
            id: "call_1",
            type: "function",
            function: { name: "add", arguments: "{\"a\":\"2\",\"b\":3}" }
          }
        ]
      },
      { role: "tool", tool_call_id: "call_1", name: "add", content: "5" },
      { role: "assistant", content: "2 + 3 = 5" }
    ]);
    expect(provider.requests).toHaveLength(2);
    expect(provider.requests[1]?.messages).toEqual(result.messages.slice(0, 3));
  });

  it("returns max_iterations when the model keeps requesting tools", async () => {
    const provider = new ScriptedProvider([
      response({
        finishReason: "tool_calls",
        toolCalls: [{ id: "call_1", name: "add", arguments: { a: 1, b: 1 } }]
      })
    ]);
    const runner = new AgentRunner(provider);

    const result = await runner.run({
      initialMessages: [{ role: "user", content: "loop" }],
      tools: makeRegistry(),
      model: "test-model",
      maxIterations: 1,
      maxToolResultChars: 1000,
      workspace: "/tmp/workspace"
    });

    expect(result.finalContent).toBe("Maximum tool iterations reached.");
    expect(result.stopReason).toBe("max_iterations");
    expect(result.messages.at(-1)).toEqual({
      role: "assistant",
      content: "Maximum tool iterations reached."
    });
  });

  it("converts provider exceptions into an error result", async () => {
    const provider: LLMProvider = {
      defaultModel: () => "test-model",
      async chat() {
        throw new Error("provider unavailable");
      }
    };
    const runner = new AgentRunner(provider);

    const result = await runner.run({
      initialMessages: [{ role: "user", content: "hello" }],
      tools: makeRegistry(),
      model: "test-model",
      maxIterations: 3,
      maxToolResultChars: 1000,
      workspace: "/tmp/workspace"
    });

    expect(result).toMatchObject({
      finalContent: "Error calling LLM: provider unavailable",
      stopReason: "error",
      error: "Error calling LLM: provider unavailable"
    });
  });

  it("truncates large tool results before appending them to messages", async () => {
    const registry = new ToolRegistry();
    registry.register({
      name: "large",
      description: "Returns a large payload.",
      parameters: { type: "object", properties: {} },
      async execute() {
        return "abcdef";
      }
    });
    const provider = new ScriptedProvider([
      response({
        finishReason: "tool_calls",
        toolCalls: [{ id: "call_1", name: "large", arguments: {} }]
      }),
      response({ content: "ok" })
    ]);
    const runner = new AgentRunner(provider);

    const result = await runner.run({
      initialMessages: [{ role: "user", content: "large" }],
      tools: registry,
      model: "test-model",
      maxIterations: 3,
      maxToolResultChars: 3,
      workspace: "/tmp/workspace"
    });

    expect(result.messages[2]).toEqual({
      role: "tool",
      tool_call_id: "call_1",
      name: "large",
      content: "abc... [truncated]"
    });
  });

  it("calls hook lifecycle methods around model and tool iterations", async () => {
    const events: string[] = [];
    class RecordingHook extends AgentHook {
      async beforeIteration(context: AgentHookContext): Promise<void> {
        events.push(`before:${context.iteration}:${context.messages.length}`);
      }

      async beforeExecuteTools(context: AgentHookContext): Promise<void> {
        events.push(`tools:${context.iteration}:${context.toolCalls.map((call) => call.name).join(",")}`);
      }

      async afterIteration(context: AgentHookContext): Promise<void> {
        events.push(`after:${context.iteration}:${context.stopReason ?? "continue"}`);
      }
    }
    const provider = new ScriptedProvider([
      response({
        finishReason: "tool_calls",
        toolCalls: [{ id: "call_1", name: "add", arguments: { a: 1, b: 2 } }]
      }),
      response({ content: "3" })
    ]);
    const runner = new AgentRunner(provider);

    await runner.run({
      initialMessages: [{ role: "user", content: "add" }],
      tools: makeRegistry(),
      model: "test-model",
      maxIterations: 3,
      maxToolResultChars: 1000,
      workspace: "/tmp/workspace",
      hook: new RecordingHook()
    });

    expect(events).toEqual([
      "before:0:1",
      "tools:0:add",
      "after:0:continue",
      "before:1:3",
      "after:1:completed"
    ]);
  });

  it("repairs orphan and missing tool results before sending messages to the provider", async () => {
    const initialMessages = [
      { role: "tool", tool_call_id: "orphan", name: "add", content: "orphaned" },
      {
        role: "assistant",
        content: "",
        tool_calls: [
          {
            id: "missing",
            type: "function",
            function: { name: "add", arguments: "{\"a\":1,\"b\":2}" }
          }
        ]
      },
      { role: "user", content: "continue" }
    ];
    const provider = new ScriptedProvider([response({ content: "repaired" })]);
    const runner = new AgentRunner(provider);

    await runner.run({
      initialMessages,
      tools: makeRegistry(),
      model: "test-model",
      maxIterations: 3,
      maxToolResultChars: 1000,
      workspace: "/tmp/workspace"
    });

    expect(provider.requests[0]?.messages).toEqual([
      {
        role: "assistant",
        content: "",
        tool_calls: [
          {
            id: "missing",
            type: "function",
            function: { name: "add", arguments: "{\"a\":1,\"b\":2}" }
          }
        ]
      },
      {
        role: "tool",
        tool_call_id: "missing",
        name: "add",
        content: "[Tool result unavailable - call was interrupted or lost]"
      },
      { role: "user", content: "continue" }
    ]);
  });

  it("compacts old large tool results before provider requests", async () => {
    const initialMessages = [
      { role: "user", content: "inspect" },
      {
        role: "assistant",
        content: "",
        tool_calls: [
          { id: "old", type: "function", function: { name: "read_file", arguments: "{}" } },
          { id: "recent", type: "function", function: { name: "read_file", arguments: "{}" } }
        ]
      },
      { role: "tool", tool_call_id: "old", name: "read_file", content: "x".repeat(600) },
      { role: "tool", tool_call_id: "recent", name: "read_file", content: "y".repeat(600) }
    ];
    const provider = new ScriptedProvider([response({ content: "ok" })]);
    const runner = new AgentRunner(provider);

    await runner.run({
      initialMessages,
      tools: makeRegistry(),
      model: "test-model",
      maxIterations: 3,
      maxToolResultChars: 1000,
      workspace: "/tmp/workspace",
      compactToolResultsKeepRecent: 1
    });

    expect(provider.requests[0]?.messages[2]).toEqual({
      role: "tool",
      tool_call_id: "old",
      name: "read_file",
      content: `[read_file result summarized: ${"x".repeat(120)}...]`
    });
    expect(provider.requests[0]?.messages[3]).toEqual(initialMessages[3]);
  });

  it("retries once when the model returns a blank final response", async () => {
    const provider = new ScriptedProvider([
      response({ content: "   " }),
      response({ content: "final after retry" })
    ]);
    const runner = new AgentRunner(provider);

    const result = await runner.run({
      initialMessages: [{ role: "user", content: "hello" }],
      tools: makeRegistry(),
      model: "test-model",
      maxIterations: 3,
      maxToolResultChars: 1000,
      workspace: "/tmp/workspace"
    });

    expect(provider.requests).toHaveLength(2);
    expect(result.finalContent).toBe("final after retry");
    expect(result.messages).toEqual([
      { role: "user", content: "hello" },
      { role: "user", content: "The previous assistant response was empty. Please provide a concise final answer." },
      { role: "assistant", content: "final after retry" }
    ]);
  });

  it("trims old messages according to the approximate context token budget", async () => {
    const provider = new ScriptedProvider([response({ content: "trimmed" })]);
    const runner = new AgentRunner(provider);

    await runner.run({
      initialMessages: [
        { role: "system", content: "system prompt" },
        { role: "user", content: "old ".repeat(100) },
        { role: "assistant", content: "older ".repeat(100) },
        { role: "user", content: "recent" }
      ],
      tools: makeRegistry(),
      model: "test-model",
      maxIterations: 3,
      maxToolResultChars: 1000,
      workspace: "/tmp/workspace",
      contextWindowTokens: 20
    });

    expect(provider.requests[0]?.messages).toEqual([
      { role: "system", content: "system prompt" },
      { role: "user", content: "recent" }
    ]);
  });

  it("does not execute or finalize tool calls when the model response was truncated", async () => {
    const provider = new ScriptedProvider([
      response({
        content: "partial text that should not be final",
        finishReason: "length",
        toolCalls: [{ id: "call_1", name: "add", arguments: { a: 2, b: 2 } }]
      }),
      response({ content: "safe final response" })
    ]);
    const runner = new AgentRunner(provider);

    const result = await runner.run({
      initialMessages: [{ role: "user", content: "add" }],
      tools: makeRegistry(),
      model: "test-model",
      maxIterations: 3,
      maxToolResultChars: 1000,
      workspace: "/tmp/workspace"
    });

    expect(result.toolsUsed).toEqual([]);
    expect(provider.requests).toHaveLength(2);
    expect(result.finalContent).toBe("safe final response");
    expect(result.messages).toEqual([
      { role: "user", content: "add" },
      {
        role: "user",
        content: "The previous model response was truncated before tool calls could be safely executed. Continue with a complete response; reissue any needed tool calls from scratch."
      },
      { role: "assistant", content: "safe final response" }
    ]);
  });

  it("returns an error if truncated tool calls cannot be recovered", async () => {
    const provider = new ScriptedProvider([
      response({
        content: "partial",
        finishReason: "length",
        toolCalls: [{ id: "call_1", name: "add", arguments: { a: 2, b: 2 } }]
      }),
      response({
        content: "partial again",
        finishReason: "length",
        toolCalls: [{ id: "call_2", name: "add", arguments: { a: 3, b: 3 } }]
      })
    ]);
    const runner = new AgentRunner(provider);

    const result = await runner.run({
      initialMessages: [{ role: "user", content: "add" }],
      tools: makeRegistry(),
      model: "test-model",
      maxIterations: 3,
      maxToolResultChars: 1000,
      workspace: "/tmp/workspace"
    });

    expect(result).toMatchObject({
      finalContent: "Error: Model response was truncated while requesting tools.",
      stopReason: "error",
      error: "Error: Model response was truncated while requesting tools.",
      toolsUsed: []
    });
  });
});
