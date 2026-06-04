import {
  type ChatRequest,
  type LLMProvider,
  type LLMResponse,
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
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      controller.abort(new Error(`OpenAI-compatible request timed out after ${this.timeoutMs}ms`));
    }, this.timeoutMs);
    let response: Response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "authorization": `Bearer ${this.apiKey}`,
          "content-type": "application/json"
        },
        signal: controller.signal,
        body: JSON.stringify({
          model: request.model ?? this.model,
          messages: request.messages,
          ...(request.tools ? { tools: request.tools } : {})
        })
      });
    } catch (error) {
      if (controller.signal.aborted) {
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
