export { createAgent } from "./agent/AgentLoop.js";
export type { Agent, AgentOptions, RunResult } from "./agent/types.js";
export { OpenAIProvider } from "./providers/OpenAIProvider.js";
export {
  isToolCapableFinishReason,
  normalizeFinishReason,
  shouldExecuteToolCalls
} from "./providers/Provider.js";
export type {
  ChatRequest,
  FinishReason,
  LLMProvider,
  LLMResponse,
  ToolCallRequest
} from "./providers/Provider.js";

export const version = "0.1.0";
