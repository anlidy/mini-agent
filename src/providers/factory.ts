import type { AgentConfig, ProviderConfig } from "../config/Config.js";
import { AnthropicProvider } from "./AnthropicProvider.js";
import { OpenAIProvider } from "./OpenAIProvider.js";
import type { LLMProvider } from "./Provider.js";

export interface CreateProviderOptions {
  fetch?: typeof fetch;
}

/**
 * Create an LLM provider instance from config. Selects the agent's configured
 * provider from the providers map and instantiates the matching implementation.
 *
 * Falls back to the first available provider when the agent's provider key is
 * not found. Falls back to OpenAIProvider when the provider type is unknown.
 */
export function createProvider(
  agent: AgentConfig,
  providers: Record<string, ProviderConfig>,
  options: CreateProviderOptions = {}
): LLMProvider {
  const providerConfig = providers[agent.provider] ?? Object.values(providers)[0];
  if (!providerConfig) {
    throw new Error(
      `Agent "${agent.provider}" references an unknown provider and no fallback is available. ` +
      "Configure at least one provider in .mini-agent/config.json."
    );
  }

  const apiKey = resolveApiKey(providerConfig);
  const model = agent.model || fallbackModel(providerConfig.type);
  const baseUrl = providerConfig.baseUrl;
  const timeoutMs = providerConfig.timeoutMs;

  switch (providerConfig.type) {
    case "anthropic":
      return new AnthropicProvider({
        apiKey,
        baseUrl,
        model,
        timeoutMs,
        ...(options.fetch ? { fetch: options.fetch } : {})
      });
    case "openai":
    default:
      return new OpenAIProvider({
        apiKey,
        baseUrl,
        model,
        timeoutMs,
        ...(options.fetch ? { fetch: options.fetch } : {})
      });
  }
}

function resolveApiKey(providerConfig: ProviderConfig): string {
  const apiKey = providerConfig.apiKey ?? process.env.MINI_AGENT_API_KEY;
  if (!apiKey) {
    throw new Error(
      "Missing provider API key. Set providers.<key>.apiKey in .mini-agent/config.json " +
      "or the MINI_AGENT_API_KEY environment variable."
    );
  }
  return apiKey;
}

function fallbackModel(type: string): string {
  switch (type) {
    case "anthropic":
      return "claude-sonnet-4-5-20250929";
    case "openai":
    default:
      return "deepseek-chat";
  }
}
