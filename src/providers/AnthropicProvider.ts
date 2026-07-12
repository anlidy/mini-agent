import {
  type ChatRequest,
  type LLMProvider,
  type LLMResponse,
  type ProviderStreamEvent,
  type ThinkingConfig,
  type ToolCallRequest,
  normalizeFinishReason
} from "./Provider.js";

export interface AnthropicProviderOptions {
  apiKey: string;
  baseUrl?: string;
  model: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

interface ToolCallFragment {
  id: string;
  name: string;
  input: Record<string, unknown>;
  partialJson: string;
}

/**
 * Maps the agent-level effort (1-4) to Anthropic thinking budget tokens.
 *  1 = auto (no thinking)
 *  2 = low  → 4 000 tokens
 *  3 = med  → 16 000 tokens
 *  4 = high → 32 000 tokens
 */
const EFFORT_BUDGET_TOKENS: Record<number, number> = {
  1: 4_000,
  2: 4_000,
  3: 16_000,
  4: 32_000
};

export class AnthropicProvider implements LLMProvider {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(options: AnthropicProviderOptions) {
    this.apiKey = options.apiKey;
    this.baseUrl = (options.baseUrl ?? "https://api.anthropic.com/v1").replace(/\/+$/, "");
    this.model = options.model;
    this.fetchImpl = options.fetch ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 60_000;
  }

  defaultModel(): string {
    return this.model;
  }

  async chat(request: ChatRequest): Promise<LLMResponse> {
    const body = this.buildRequestBody(request, false);
    const response = await this.send(body, request.signal);
    const json = await response.json() as Record<string, unknown>;
    return this.parseResponse(json);
  }

  async *chatStream(request: ChatRequest): AsyncIterable<ProviderStreamEvent> {
    const body = this.buildRequestBody(request, true);
    const response = await this.send(body, request.signal);
    if (!response.body) {
      throw new Error("Anthropic streaming response had no body");
    }
    yield* this.parseSseStream(response.body);
  }

  async listModels(): Promise<string[]> {
    const response = await this.fetchImpl(`${this.baseUrl}/models`, {
      method: "GET",
      headers: {
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json"
      }
    });
    if (!response.ok) {
      throw new Error(`Failed to fetch models: ${response.status} ${response.statusText}: ${await response.text()}`);
    }
    const body = await response.json() as Record<string, unknown>;
    const data = body.data;
    if (!Array.isArray(data)) return [];
    return data
      .map((item: unknown) => {
        if (item && typeof item === "object" && !Array.isArray(item)) {
          return (item as Record<string, unknown>).id;
        }
        return undefined;
      })
      .filter((id: unknown): id is string => typeof id === "string")
      .sort();
  }

  /* ---- request building ---- */

  private buildRequestBody(request: ChatRequest, stream: boolean): Record<string, unknown> {
    const { system, messages } = this.convertMessages(request.messages);
    const body: Record<string, unknown> = {
      model: request.model ?? this.model,
      max_tokens: 4096,
      messages,
      ...(system ? { system } : {}),
      ...(stream ? { stream: true } : {})
    };

    if (request.tools && request.tools.length > 0) {
      body.tools = this.convertTools(request.tools);
    }

    // Determine thinking config: explicit thinking config takes precedence,
    // then effort-based auto-mapping.
    const thinking = this.resolveThinking(request.thinking, request.effort);
    if (thinking) {
      body.thinking = { type: "enabled", budget_tokens: thinking.budgetTokens };
      // Increase max_tokens to accommodate thinking budget.
      body.max_tokens = 4096 + thinking.budgetTokens;
    }

    return body;
  }

  private resolveThinking(thinking?: ThinkingConfig, effort?: number): ThinkingConfig | null {
    if (thinking?.enabled) {
      return thinking;
    }
    // effort 1 = auto = no thinking for Anthropic
    if (effort && effort > 1) {
      return { enabled: true, budgetTokens: EFFORT_BUDGET_TOKENS[effort] ?? 16_000 };
    }
    return null;
  }

  /* ---- message conversion ---- */

  private convertMessages(openaiMessages: Array<Record<string, unknown>>): {
    system?: string;
    messages: Array<Record<string, unknown>>;
  } {
    const systemParts: string[] = [];
    const anthropicMessages: Array<Record<string, unknown>> = [];

    for (const msg of openaiMessages) {
      const role = typeof msg.role === "string" ? msg.role : "user";
      if (role === "system") {
        const content = msg.content;
        if (typeof content === "string") {
          systemParts.push(content);
        } else if (Array.isArray(content)) {
          for (const part of content) {
            if (part && typeof part === "object" && (part as Record<string, unknown>).type === "text") {
              const text = (part as Record<string, unknown>).text;
              if (typeof text === "string") systemParts.push(text);
            }
          }
        }
        continue;
      }
      anthropicMessages.push(this.convertMessage(msg));
    }

    return {
      system: systemParts.length > 0 ? systemParts.join("\n\n") : undefined,
      messages: anthropicMessages
    };
  }

  private convertMessage(msg: Record<string, unknown>): Record<string, unknown> {
    const role = typeof msg.role === "string" ? msg.role : "user";
    const content = msg.content;

    if (role === "tool") {
      const toolCallId = typeof msg.tool_call_id === "string" ? msg.tool_call_id : "";
      return {
        role: "user",
        content: [{
          type: "tool_result",
          tool_use_id: toolCallId,
          content: typeof content === "string" ? content : JSON.stringify(content)
        }]
      };
    }

    if (role === "assistant") {
      const toolCalls = msg.tool_calls;
      const text = typeof content === "string" ? content : "";
      const contentBlocks: Array<Record<string, unknown>> = [];
      if (text) {
        contentBlocks.push({ type: "text", text });
      }
      if (Array.isArray(toolCalls)) {
        for (const tc of toolCalls) {
          if (!tc || typeof tc !== "object" || Array.isArray(tc)) continue;
          const candidate = tc as Record<string, unknown>;
          const fn = candidate.function as Record<string, unknown> | undefined;
          const id = typeof candidate.id === "string" ? candidate.id : "";
          if (!fn || typeof fn !== "object") continue;
          const name = typeof fn.name === "string" ? fn.name : "";
          if (!id || !name) continue;
          let input: unknown = {};
          const args = fn.arguments;
          if (typeof args === "string" && args.trim()) {
            try { input = JSON.parse(args); } catch { /* keep empty */ }
          } else if (args && typeof args === "object" && !Array.isArray(args)) {
            input = args;
          }
          contentBlocks.push({ type: "tool_use", id, name, input });
        }
      }
      return {
        role: "assistant",
        content: contentBlocks.length > 0 ? contentBlocks : text
      };
    }

    return { role: "user", content: typeof content === "string" ? content : JSON.stringify(content) };
  }

  /* ---- tool conversion ---- */

  private convertTools(openaiTools: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
    return openaiTools.flatMap((tool) => {
      if (!tool || typeof tool !== "object" || Array.isArray(tool)) return [];
      const fn = (tool as Record<string, unknown>).function;
      if (!fn || typeof fn !== "object" || Array.isArray(fn)) return [];
      const fnObj = fn as Record<string, unknown>;
      return [{
        name: fnObj.name,
        description: fnObj.description ?? "",
        input_schema: fnObj.parameters ?? { type: "object", properties: {} }
      }];
    });
  }

  /* ---- response parsing ---- */

  private parseResponse(json: Record<string, unknown>): LLMResponse {
    const content = json.content;
    const contentBlocks = Array.isArray(content) ? content : [];
    let textContent: string | null = null;
    let reasoningContent: string | null = null;
    const toolCalls: ToolCallRequest[] = [];
    const textParts: string[] = [];
    const reasoningParts: string[] = [];

    for (const block of contentBlocks) {
      if (!block || typeof block !== "object" || Array.isArray(block)) continue;
      const blockObj = block as Record<string, unknown>;
      if (blockObj.type === "text" && typeof blockObj.text === "string") {
        textParts.push(blockObj.text);
      } else if (blockObj.type === "thinking" && typeof blockObj.thinking === "string") {
        reasoningParts.push(blockObj.thinking);
      } else if (blockObj.type === "tool_use") {
        const id = typeof blockObj.id === "string" ? blockObj.id : "";
        const name = typeof blockObj.name === "string" ? blockObj.name : "";
        if (id && name) {
          const input = blockObj.input;
          toolCalls.push({
            id,
            name,
            arguments: (input && typeof input === "object" && !Array.isArray(input))
              ? input as Record<string, unknown>
              : {}
          });
        }
      }
    }

    if (textParts.length > 0) textContent = textParts.join("");
    if (reasoningParts.length > 0) reasoningContent = reasoningParts.join("");

    const stopReason = json.stop_reason;
    const finishReason =
      stopReason === "end_turn" ? "stop" :
      stopReason === "tool_use" ? "tool_calls" :
      stopReason === "max_tokens" ? "length" :
      stopReason;

    return {
      content: textContent,
      reasoningContent,
      toolCalls,
      finishReason: normalizeFinishReason(finishReason),
      usage: numericRecord(json.usage as Record<string, unknown> | undefined)
    };
  }

  /* ---- SSE stream parsing ---- */

  private async *parseSseStream(body: ReadableStream<Uint8Array>): AsyncIterable<ProviderStreamEvent> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    let textContent = "";
    let reasoningContent = "";
    const toolCalls = new Map<number, ToolCallFragment>();
    let currentBlockIndex = -1;
    let finishReason: unknown;
    let usage: Record<string, number> = {};

    const processEvent = (eventType: string, data: string): void => {
      if (!data) return;
      let json: Record<string, unknown>;
      try {
        json = JSON.parse(data) as Record<string, unknown>;
      } catch {
        return;
      }

      switch (eventType) {
        case "content_block_start": {
          const block = json.content_block as Record<string, unknown> | undefined;
          currentBlockIndex = typeof json.index === "number" ? json.index : 0;
          if (block?.type === "tool_use") {
            toolCalls.set(currentBlockIndex, {
              id: typeof block.id === "string" ? block.id : "",
              name: typeof block.name === "string" ? block.name : "",
              input: {},
              partialJson: ""
            });
          }
          break;
        }
        case "content_block_delta": {
          const delta = json.delta as Record<string, unknown> | undefined;
          if (!delta) break;
          if (delta.type === "text_delta" && typeof delta.text === "string") {
            textContent += delta.text;
          } else if (delta.type === "thinking_delta" && typeof delta.thinking === "string") {
            reasoningContent += delta.thinking;
          } else if (delta.type === "input_json_delta" && typeof delta.partial_json === "string") {
            const tc = toolCalls.get(currentBlockIndex);
            if (tc) tc.partialJson += delta.partial_json;
          }
          break;
        }
        case "message_delta": {
          const delta = json.delta as Record<string, unknown> | undefined;
          if (delta?.stop_reason != null) finishReason = delta.stop_reason;
          const u = json.usage as Record<string, unknown> | undefined;
          if (u && typeof u === "object") usage = numericRecord(u);
          break;
        }
      }
    };

    try {
      let currentEvent = "";
      let currentData = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (line.startsWith("event: ")) {
            currentEvent = line.slice("event: ".length).trim();
          } else if (line.startsWith("data: ")) {
            currentData = line.slice("data: ".length).trim();
          } else if (line.trim() === "") {
            if (currentData) {
              const textBefore = textContent;
              const reasoningBefore = reasoningContent;
              processEvent(currentEvent, currentData);
              if (reasoningContent.length > reasoningBefore.length) {
                yield { type: "reasoning", content: reasoningContent.slice(reasoningBefore.length) };
              }
              if (textContent.length > textBefore.length) {
                yield { type: "delta", content: textContent.slice(textBefore.length) };
              }
            }
            currentEvent = "";
            currentData = "";
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    // Assemble tool calls from fragments
    const assembledToolCalls: ToolCallRequest[] = [];
    for (const [, tc] of [...toolCalls.entries()].sort(([a], [b]) => a - b)) {
      if (!tc.id || !tc.name) continue;
      let args = tc.input;
      if (tc.partialJson) {
        try { args = JSON.parse(tc.partialJson) as Record<string, unknown>; } catch { /* keep raw */ }
      }
      assembledToolCalls.push({ id: tc.id, name: tc.name, arguments: args });
    }

    const stopReason = String(finishReason ?? "");
    const resolvedReason =
      stopReason === "end_turn" ? "stop" :
      stopReason === "tool_use" ? "tool_calls" :
      stopReason === "max_tokens" ? "length" :
      stopReason || undefined;

    yield {
      type: "done",
      response: {
        content: textContent.length > 0 ? textContent : null,
        reasoningContent: reasoningContent.length > 0 ? reasoningContent : null,
        toolCalls: assembledToolCalls,
        finishReason: normalizeFinishReason(resolvedReason),
        usage
      }
    };
  }

  /* ---- HTTP transport ---- */

  private async send(body: Record<string, unknown>, signal?: AbortSignal): Promise<Response> {
    const timeoutController = new AbortController();
    const timeout = setTimeout(() => {
      timeoutController.abort(new Error(`Anthropic request timed out after ${this.timeoutMs}ms`));
    }, this.timeoutMs);

    const composedSignal = signal
      ? AbortSignal.any([signal, timeoutController.signal])
      : timeoutController.signal;

    let response: Response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}/messages`, {
        method: "POST",
        headers: {
          "x-api-key": this.apiKey,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json"
        },
        signal: composedSignal,
        body: JSON.stringify(body)
      });
    } catch (error) {
      if (signal?.aborted) throw new Error("Anthropic request was aborted");
      if (timeoutController.signal.aborted) {
        throw new Error(`Anthropic request timed out after ${this.timeoutMs}ms`);
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      throw new Error(
        `Anthropic request failed: ${response.status} ${response.statusText}: ${await response.text()}`
      );
    }
    return response;
  }
}

function numericRecord(value: Record<string, unknown> | undefined): Record<string, number> {
  if (!value) return {};
  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, number] => typeof entry[1] === "number")
  );
}
