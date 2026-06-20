export { createAgent } from "./agent/AgentLoop.js";
export { AgentLoop } from "./agent/AgentLoop.js";
export type { Agent, AgentOptions, RunResult } from "./agent/types.js";
export { defaultConfig, ensureDefaultConfig, loadConfig } from "./config/loadConfig.js";
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
export { SessionManager } from "./session/SessionManager.js";
export { createServer, startServer } from "./server/index.js";
export type { CreateServerOptions, MiniAgentServer } from "./server/index.js";
export { createDefaultToolRegistry } from "./tools/index.js";

export const version = "0.1.0";
