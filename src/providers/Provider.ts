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
  toolCalls: ToolCallRequest[];
  finishReason: FinishReason;
  usage: Record<string, number>;
}

export interface ChatRequest {
  messages: Array<Record<string, unknown>>;
  tools?: Array<Record<string, unknown>>;
  model?: string;
}

export interface LLMProvider {
  defaultModel(): string;
  chat(request: ChatRequest): Promise<LLMResponse>;
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
