import type { AgentMessage } from "./AgentRunner.js";
import type { LLMResponse, ToolCallRequest } from "../providers/Provider.js";

export interface AgentHookContext {
  iteration: number;
  messages: AgentMessage[];
  response?: LLMResponse;
  usage?: Record<string, number>;
  toolCalls: ToolCallRequest[];
  toolResults: unknown[];
  finalContent?: string | null;
  stopReason?: string;
  error?: string;
}

export class AgentHook {
  async beforeIteration(_context: AgentHookContext): Promise<void> {}
  async beforeExecuteTools(_context: AgentHookContext): Promise<void> {}
  async afterIteration(_context: AgentHookContext): Promise<void> {}
}
