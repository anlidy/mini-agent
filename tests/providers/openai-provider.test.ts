import { describe, expect, it } from "vitest";

import { OpenAIProvider } from "../../src/providers/OpenAIProvider.js";
import type { ProviderStreamEvent } from "../../src/providers/Provider.js";

function jsonResponse(body: unknown, init: { ok?: boolean; status?: number; statusText?: string } = {}): Response {
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    statusText: init.statusText ?? "OK",
    async json() {
      return body;
    },
    async text() {
      return JSON.stringify(body);
    }
  } as Response;
}

function sseResponse(chunks: string[]): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    }
  });
  return new Response(stream, { status: 200, headers: { "content-type": "text/event-stream" } });
}

async function collectStream(iterable: AsyncIterable<ProviderStreamEvent>): Promise<ProviderStreamEvent[]> {
  const events: ProviderStreamEvent[] = [];
  for await (const event of iterable) {
    events.push(event);
  }
  return events;
}

describe("OpenAIProvider", () => {
  it("sends OpenAI-compatible chat completion requests", async () => {
    const requests: Array<{ url: string; init: RequestInit }> = [];
    const provider = new OpenAIProvider({
      apiKey: "test-key",
      baseUrl: "https://example.test/v1",
      model: "test-model",
      fetch: async (url, init) => {
        requests.push({ url: String(url), init: init ?? {} });
        return jsonResponse({
          choices: [{ message: { content: "hello" }, finish_reason: "stop" }],
          usage: { prompt_tokens: 1, completion_tokens: 2 }
        });
      }
    });

    const result = await provider.chat({
      messages: [{ role: "user", content: "hi" }],
      tools: [{ type: "function", function: { name: "noop", description: "Noop", parameters: {} } }]
    });

    expect(requests).toHaveLength(1);
    expect(requests[0]?.url).toBe("https://example.test/v1/chat/completions");
    expect(requests[0]?.init.method).toBe("POST");
    expect(requests[0]?.init.headers).toEqual({
      "authorization": "Bearer test-key",
      "content-type": "application/json"
    });
    expect(JSON.parse(String(requests[0]?.init.body))).toEqual({
      model: "test-model",
      messages: [{ role: "user", content: "hi" }],
      tools: [{ type: "function", function: { name: "noop", description: "Noop", parameters: {} } }]
    });
    expect(result).toEqual({
      content: "hello",
      toolCalls: [],
      finishReason: "stop",
      usage: { prompt_tokens: 1, completion_tokens: 2 }
    });
  });

  it("parses tool calls and JSON arguments from OpenAI responses", async () => {
    const provider = new OpenAIProvider({
      apiKey: "test-key",
      model: "test-model",
      fetch: async () => jsonResponse({
        choices: [
          {
            message: {
              content: null,
              tool_calls: [
                {
                  id: "call_1",
                  function: {
                    name: "read_file",
                    arguments: "{\"path\":\"README.md\"}"
                  }
                }
              ]
            },
            finish_reason: "tool_calls"
          }
        ],
        usage: { total_tokens: 9 }
      })
    });

    await expect(provider.chat({
      messages: [{ role: "user", content: "read" }]
    })).resolves.toEqual({
      content: null,
      toolCalls: [{ id: "call_1", name: "read_file", arguments: { path: "README.md" } }],
      finishReason: "tool_calls",
      usage: { total_tokens: 9 }
    });
  });

  it("keeps malformed tool arguments as an empty object instead of throwing", async () => {
    const provider = new OpenAIProvider({
      apiKey: "test-key",
      model: "test-model",
      fetch: async () => jsonResponse({
        choices: [
          {
            message: {
              tool_calls: [
                { id: "call_bad", function: { name: "read_file", arguments: "{" } }
              ]
            },
            finish_reason: "tool_calls"
          }
        ]
      })
    });

    const result = await provider.chat({ messages: [{ role: "user", content: "read" }] });

    expect(result.toolCalls).toEqual([{ id: "call_bad", name: "read_file", arguments: {} }]);
  });

  it("throws a readable error for non-2xx responses", async () => {
    const provider = new OpenAIProvider({
      apiKey: "test-key",
      model: "test-model",
      fetch: async () => jsonResponse({ error: { message: "bad key" } }, {
        ok: false,
        status: 401,
        statusText: "Unauthorized"
      })
    });

    await expect(provider.chat({ messages: [{ role: "user", content: "hi" }] }))
      .rejects.toThrow("OpenAI-compatible request failed: 401 Unauthorized: {\"error\":{\"message\":\"bad key\"}}");
  });

  it("aborts requests after the configured timeout", async () => {
    const provider = new OpenAIProvider({
      apiKey: "test-key",
      model: "test-model",
      timeoutMs: 1,
      fetch: async (_url, init) => new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal;
        if (signal instanceof AbortSignal) {
          signal.addEventListener("abort", () => reject(signal.reason));
        }
      })
    });

    await expect(provider.chat({ messages: [{ role: "user", content: "hi" }] }))
      .rejects.toThrow("OpenAI-compatible request timed out after 1ms");
  });

  it("aborts the request when the caller signal fires", async () => {
    const controller = new AbortController();
    const provider = new OpenAIProvider({
      apiKey: "test-key",
      model: "test-model",
      timeoutMs: 10_000,
      fetch: async (_url, init) => new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal;
        if (signal instanceof AbortSignal) {
          signal.addEventListener("abort", () => reject(signal.reason));
        }
        setTimeout(() => controller.abort(new Error("user cancelled")), 1);
      })
    });

    await expect(provider.chat({ messages: [{ role: "user", content: "hi" }], signal: controller.signal }))
      .rejects.toThrow("OpenAI-compatible request was aborted");
  });

  it("streams content deltas and a final assembled response over SSE", async () => {
    let requestBody: Record<string, unknown> = {};
    const provider = new OpenAIProvider({
      apiKey: "test-key",
      model: "test-model",
      fetch: async (_url, init) => {
        requestBody = JSON.parse(String(init?.body));
        return sseResponse([
          "data: {\"choices\":[{\"delta\":{\"content\":\"Hel\"}}]}\n\n",
          "data: {\"choices\":[{\"delta\":{\"content\":\"lo\"}}]}\n\n",
          "data: {\"choices\":[{\"delta\":{},\"finish_reason\":\"stop\"}],\"usage\":{\"total_tokens\":7}}\n\n",
          "data: [DONE]\n\n"
        ]);
      }
    });

    const events = await collectStream(provider.chatStream!({ messages: [{ role: "user", content: "hi" }] }));

    expect(requestBody.stream).toBe(true);
    expect(events.filter((event) => event.type === "delta").map((event) => (event as { content: string }).content))
      .toEqual(["Hel", "lo"]);
    const done = events.at(-1);
    expect(done).toEqual({
      type: "done",
      response: { content: "Hello", toolCalls: [], finishReason: "stop", usage: { total_tokens: 7 } }
    });
  });

  it("assembles fragmented tool calls from the stream", async () => {
    const provider = new OpenAIProvider({
      apiKey: "test-key",
      model: "test-model",
      fetch: async () => sseResponse([
        "data: {\"choices\":[{\"delta\":{\"tool_calls\":[{\"index\":0,\"id\":\"call_1\",\"function\":{\"name\":\"read_file\",\"arguments\":\"{\\\"path\\\":\"}}]}}]}\n\n",
        "data: {\"choices\":[{\"delta\":{\"tool_calls\":[{\"index\":0,\"function\":{\"arguments\":\"\\\"a.ts\\\"}\"}}]}}]}\n\n",
        "data: {\"choices\":[{\"delta\":{},\"finish_reason\":\"tool_calls\"}]}\n\n",
        "data: [DONE]\n\n"
      ])
    });

    const events = await collectStream(provider.chatStream!({ messages: [{ role: "user", content: "read" }] }));
    const done = events.at(-1) as { type: "done"; response: { toolCalls: unknown[]; finishReason: string } };

    expect(done.response.finishReason).toBe("tool_calls");
    expect(done.response.toolCalls).toEqual([{ id: "call_1", name: "read_file", arguments: { path: "a.ts" } }]);
  });
});
