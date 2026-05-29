export interface ToolCallRequest {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface LLMResponse {
  content: string | null;
  toolCalls: ToolCallRequest[];
  finishReason: string;
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
