import {
  type ChatRequest,
  type LLMProvider,
  type LLMResponse,
  type ProviderStreamEvent,
  type ToolCallRequest,
  normalizeFinishReason
} from "./Provider.js";

export interface OpenAIProviderOptions {
  apiKey: string;
  baseUrl?: string;
  model: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

export class OpenAIProvider implements LLMProvider {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(options: OpenAIProviderOptions) {
    this.apiKey = options.apiKey;
    this.baseUrl = (options.baseUrl ?? "https://api.openai.com/v1").replace(/\/+$/, "");
    this.model = options.model;
    this.fetchImpl = options.fetch ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 60_000;
  }

  defaultModel(): string {
    return this.model;
  }

  async chat(request: ChatRequest): Promise<LLMResponse> {
    const response = await this.send(request, false);
    const body = await response.json() as Record<string, unknown>;
    const choice = firstChoice(body);
    const message = objectField(choice, "message");

    return {
      content: contentField(message),
      toolCalls: parseToolCalls(message),
      finishReason: normalizeFinishReason(choice.finish_reason),
      usage: numericRecord(objectField(body, "usage"))
    };
  }

  async *chatStream(request: ChatRequest): AsyncIterable<ProviderStreamEvent> {
    const response = await this.send(request, true);
    if (!response.body) {
      throw new Error("OpenAI-compatible streaming response had no body");
    }
    yield* parseSseStream(response.body);
  }

  /**
   * Shared request path: composes the caller signal with an internal timeout,
   * issues the POST, and translates abort/timeout/non-2xx into clear errors.
   * Returns the raw Response so chat() can parse JSON and chatStream() can read
   * the SSE body.
   */
  private async send(request: ChatRequest, stream: boolean): Promise<Response> {
    const timeoutController = new AbortController();
    const timeout = setTimeout(() => {
      timeoutController.abort(new Error(`OpenAI-compatible request timed out after ${this.timeoutMs}ms`));
    }, this.timeoutMs);
    const signal = request.signal
      ? AbortSignal.any([request.signal, timeoutController.signal])
      : timeoutController.signal;
    let response: Response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "authorization": `Bearer ${this.apiKey}`,
          "content-type": "application/json"
        },
        signal,
        body: JSON.stringify({
          model: request.model ?? this.model,
          messages: request.messages,
          ...(request.tools ? { tools: request.tools } : {}),
          ...(stream ? { stream: true } : {})
        })
      });
    } catch (error) {
      if (request.signal?.aborted) {
        throw new Error("OpenAI-compatible request was aborted");
      }
      if (timeoutController.signal.aborted) {
        throw new Error(`OpenAI-compatible request timed out after ${this.timeoutMs}ms`);
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      throw new Error(
        `OpenAI-compatible request failed: ${response.status} ${response.statusText}: ${await response.text()}`
      );
    }
    return response;
  }
}

function firstChoice(body: Record<string, unknown>): Record<string, unknown> {
  const choices = body.choices;
  if (!Array.isArray(choices) || choices.length === 0) {
    return {};
  }
  const first = choices[0];
  return first && typeof first === "object" && !Array.isArray(first)
    ? first as Record<string, unknown>
    : {};
}

function objectField(source: Record<string, unknown>, key: string): Record<string, unknown> {
  const value = source[key];
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function contentField(message: Record<string, unknown>): string | null {
  return typeof message.content === "string" ? message.content : null;
}

function parseToolCalls(message: Record<string, unknown>): ToolCallRequest[] {
  if (!Array.isArray(message.tool_calls)) {
    return [];
  }

  return message.tool_calls.flatMap((item): ToolCallRequest[] => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return [];
    }
    const raw = item as Record<string, unknown>;
    const fn = objectField(raw, "function");
    const id = typeof raw.id === "string" ? raw.id : "";
    const name = typeof fn.name === "string" ? fn.name : "";
    if (!id || !name) {
      return [];
    }
    return [{
      id,
      name,
      arguments: parseArguments(fn.arguments)
    }];
  });
}

function parseArguments(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (typeof value !== "string" || !value.trim()) {
    return {};
  }
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

function numericRecord(value: Record<string, unknown>): Record<string, number> {
  return Object.fromEntries(
    Object.entries(value)
      .filter((entry): entry is [string, number] => typeof entry[1] === "number")
  );
}

interface ToolCallFragment {
  id: string;
  name: string;
  arguments: string;
}

/**
 * Parse an OpenAI-compatible SSE stream into provider events. Content arrives as
 * `delta` events; tool-call fragments are accumulated by index and the finish
 * reason + usage are captured, then a single `done` event carries the assembled
 * LLMResponse. Tolerant of partial lines split across network chunks.
 */
async function* parseSseStream(body: ReadableStream<Uint8Array>): AsyncIterable<ProviderStreamEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let content = "";
  let finishReason: unknown;
  let usage: Record<string, number> = {};
  const fragments = new Map<number, ToolCallFragment>();
  let done = false;

  const handlePayload = (payload: string): void => {
    const json = JSON.parse(payload) as Record<string, unknown>;
    const choice = firstChoice(json);
    const delta = objectField(choice, "delta");
    if (typeof delta.content === "string" && delta.content.length > 0) {
      content += delta.content;
    }
    accumulateToolCallFragments(fragments, delta.tool_calls);
    if (choice.finish_reason != null) {
      finishReason = choice.finish_reason;
    }
    const usageField = json.usage;
    if (usageField && typeof usageField === "object" && !Array.isArray(usageField)) {
      usage = numericRecord(usageField as Record<string, unknown>);
    }
  };

  try {
    while (!done) {
      const { done: streamDone, value } = await reader.read();
      if (streamDone) {
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) {
          continue;
        }
        const payload = trimmed.slice("data:".length).trim();
        if (payload === "[DONE]") {
          done = true;
          break;
        }
        const before = content;
        handlePayload(payload);
        if (content.length > before.length) {
          yield { type: "delta", content: content.slice(before.length) };
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  yield {
    type: "done",
    response: {
      content: content.length > 0 ? content : null,
      toolCalls: assembleToolCalls(fragments),
      finishReason: normalizeFinishReason(finishReason),
      usage
    }
  };
}

function accumulateToolCallFragments(fragments: Map<number, ToolCallFragment>, raw: unknown): void {
  if (!Array.isArray(raw)) {
    return;
  }
  for (const item of raw) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      continue;
    }
    const candidate = item as Record<string, unknown>;
    const index = typeof candidate.index === "number" ? candidate.index : 0;
    const fn = objectField(candidate, "function");
    const fragment = fragments.get(index) ?? { id: "", name: "", arguments: "" };
    if (typeof candidate.id === "string" && candidate.id) {
      fragment.id = candidate.id;
    }
    if (typeof fn.name === "string" && fn.name) {
      fragment.name = fn.name;
    }
    if (typeof fn.arguments === "string") {
      fragment.arguments += fn.arguments;
    }
    fragments.set(index, fragment);
  }
}

function assembleToolCalls(fragments: Map<number, ToolCallFragment>): ToolCallRequest[] {
  return [...fragments.entries()]
    .sort(([left], [right]) => left - right)
    .flatMap(([, fragment]): ToolCallRequest[] => {
      if (!fragment.id || !fragment.name) {
        return [];
      }
      return [{ id: fragment.id, name: fragment.name, arguments: parseArguments(fragment.arguments) }];
    });
}
