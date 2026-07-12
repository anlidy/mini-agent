export type FinishReason =
  | "stop"
  | "tool_calls"
  | "function_call"
  | "length"
  | "content_filter"
  | "refusal"
  | "error"
  | "unknown";

export interface ToolCallRequest {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface LLMResponse {
  content: string | null;
  /** Thinking / chain-of-thought content (Anthropic extended thinking, etc.). */
  reasoningContent: string | null;
  toolCalls: ToolCallRequest[];
  finishReason: FinishReason;
  usage: Record<string, number>;
}

export interface ThinkingConfig {
  enabled: boolean;
  budgetTokens: number;
}

export interface ChatRequest {
  messages: Array<Record<string, unknown>>;
  tools?: Array<Record<string, unknown>>;
  model?: string;
  signal?: AbortSignal;
  thinking?: ThinkingConfig;
  effort?: 1 | 2 | 3 | 4;
}

/**
 * Incremental events from a streaming chat call. `delta` carries live text
 * chunks; `reasoning` carries thinking content; `done` carries the fully
 * assembled response.
 */
export type ProviderStreamEvent =
  | { type: "delta"; content: string }
  | { type: "reasoning"; content: string }
  | { type: "done"; response: LLMResponse };

export interface LLMProvider {
  defaultModel(): string;
  chat(request: ChatRequest): Promise<LLMResponse>;
  chatStream?(request: ChatRequest): AsyncIterable<ProviderStreamEvent>;
  /** Fetch the list of available models from the provider API. */
  listModels?(): Promise<string[]>;
}

const KNOWN_FINISH_REASONS = new Set<FinishReason>([
  "stop",
  "tool_calls",
  "function_call",
  "length",
  "content_filter",
  "refusal",
  "error",
  "unknown"
]);

const TOOL_CAPABLE_FINISH_REASONS = new Set<FinishReason>([
  "tool_calls",
  "function_call",
  "stop"
]);

export function normalizeFinishReason(value: unknown): FinishReason {
  return typeof value === "string" && KNOWN_FINISH_REASONS.has(value as FinishReason)
    ? value as FinishReason
    : "unknown";
}

export function isToolCapableFinishReason(value: FinishReason): boolean {
  return TOOL_CAPABLE_FINISH_REASONS.has(value);
}

export function shouldExecuteToolCalls(response: LLMResponse): boolean {
  return response.toolCalls.length > 0 && isToolCapableFinishReason(response.finishReason);
}
