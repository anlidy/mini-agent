import { shouldExecuteToolCalls, type LLMProvider, type LLMResponse, type ToolCallRequest } from "../providers/Provider.js";
import type { ToolRegistry } from "../tools/ToolRegistry.js";
import { AgentHook, type AgentHookContext } from "./hooks.js";

export type AgentMessage = Record<string, unknown>;

export interface AgentRunSpec {
  initialMessages: AgentMessage[];
  tools: ToolRegistry;
  model: string;
  maxIterations: number;
  maxToolResultChars: number;
  workspace?: string;
  hook?: AgentHook;
  contextWindowTokens?: number;
  compactToolResultsKeepRecent?: number;
}

export interface AgentRunResult {
  finalContent: string | null;
  messages: AgentMessage[];
  toolsUsed: string[];
  usage: Record<string, number>;
  stopReason: "completed" | "max_iterations" | "error";
  error?: string;
  toolEvents: Array<{ name: string; status: "ok" | "error"; detail: string }>;
}

export class AgentRunner {
  constructor(private readonly provider: LLMProvider) {}

  async run(spec: AgentRunSpec): Promise<AgentRunResult> {
    const messages = [...spec.initialMessages];
    const hook = spec.hook ?? new AgentHook();
    const toolsUsed: string[] = [];
    const usage: Record<string, number> = {};
    const toolEvents: AgentRunResult["toolEvents"] = [];
    let emptyFinalRetries = 0;
    let truncatedToolCallRecoveries = 0;

    for (let iteration = 0; iteration < spec.maxIterations; iteration += 1) {
      const hookContext: AgentHookContext = {
        iteration,
        messages,
        toolCalls: [],
        toolResults: []
      };
      await hook.beforeIteration(hookContext);
      let response: LLMResponse;
      try {
        response = await this.provider.chat({
          messages: prepareMessagesForModel(messages, spec),
          tools: spec.tools.getDefinitions(),
          model: spec.model
        });
      } catch (error) {
        const finalContent = `Error calling LLM: ${error instanceof Error ? error.message : String(error)}`;
        messages.push({ role: "assistant", content: finalContent });
        hookContext.finalContent = finalContent;
        hookContext.stopReason = "error";
        hookContext.error = finalContent;
        await hook.afterIteration(hookContext);
        return {
          finalContent,
          messages,
          toolsUsed,
          usage,
          stopReason: "error",
          error: finalContent,
          toolEvents
        };
      }

      accumulateUsage(usage, response.usage);
      hookContext.response = response;
      hookContext.usage = { ...response.usage };
      hookContext.toolCalls = [...response.toolCalls];

      if (hasTruncatedToolCalls(response)) {
        if (truncatedToolCallRecoveries < 1) {
          truncatedToolCallRecoveries += 1;
          messages.push({
            role: "user",
            content: "The previous model response was truncated before tool calls could be safely executed. Continue with a complete response; reissue any needed tool calls from scratch."
          });
          await hook.afterIteration(hookContext);
          continue;
        }
        const finalContent = "Error: Model response was truncated while requesting tools.";
        messages.push({ role: "assistant", content: finalContent });
        hookContext.finalContent = finalContent;
        hookContext.stopReason = "error";
        hookContext.error = finalContent;
        await hook.afterIteration(hookContext);
        return {
          finalContent,
          messages,
          toolsUsed,
          usage,
          stopReason: "error",
          error: finalContent,
          toolEvents
        };
      }

      if (shouldExecuteTools(response)) {
        messages.push(buildAssistantToolCallMessage(response));
        await hook.beforeExecuteTools(hookContext);
        for (const toolCall of response.toolCalls) {
          toolsUsed.push(toolCall.name);
          const result = await spec.tools.execute(
            toolCall.name,
            toolCall.arguments,
            { workspace: spec.workspace ?? process.cwd() }
          );
          const content = normalizeToolResult(result, spec.maxToolResultChars);
          hookContext.toolResults.push(content);
          messages.push({
            role: "tool",
            tool_call_id: toolCall.id,
            name: toolCall.name,
            content
          });
          toolEvents.push({
            name: toolCall.name,
            status: typeof content === "string" && content.startsWith("Error") ? "error" : "ok",
            detail: summarizeToolResult(content)
          });
        }
        await hook.afterIteration(hookContext);
        continue;
      }

      const finalContent = response.content ?? "";
      if (isBlank(finalContent) && emptyFinalRetries < 1) {
        emptyFinalRetries += 1;
        messages.push({
          role: "user",
          content: "The previous assistant response was empty. Please provide a concise final answer."
        });
        await hook.afterIteration(hookContext);
        continue;
      }
      messages.push({ role: "assistant", content: finalContent });
      hookContext.finalContent = finalContent;
      hookContext.stopReason = "completed";
      await hook.afterIteration(hookContext);
      return {
        finalContent,
        messages,
        toolsUsed,
        usage,
        stopReason: "completed",
        toolEvents
      };
    }

    const finalContent = "Maximum tool iterations reached.";
    messages.push({ role: "assistant", content: finalContent });
    return {
      finalContent,
      messages,
      toolsUsed,
      usage,
      stopReason: "max_iterations",
      toolEvents
    };
  }
}

const MISSING_TOOL_RESULT = "[Tool result unavailable - call was interrupted or lost]";
const COMPACTABLE_TOOLS = new Set(["read_file", "grep", "find_files", "web_search", "web_fetch", "list_dir"]);
const DEFAULT_COMPACT_KEEP_RECENT = 10;
const COMPACT_MIN_CHARS = 500;

function prepareMessagesForModel(messages: AgentMessage[], spec: AgentRunSpec): AgentMessage[] {
  let prepared = messages.map((message) => ({ ...message }));
  prepared = dropOrphanToolResults(prepared);
  prepared = backfillMissingToolResults(prepared);
  prepared = compactOldToolResults(prepared, spec.compactToolResultsKeepRecent ?? DEFAULT_COMPACT_KEEP_RECENT);
  prepared = trimToContextBudget(prepared, spec.contextWindowTokens);
  prepared = dropOrphanToolResults(prepared);
  prepared = backfillMissingToolResults(prepared);
  return prepared;
}

function shouldExecuteTools(response: LLMResponse): boolean {
  return shouldExecuteToolCalls(response);
}

function hasTruncatedToolCalls(response: LLMResponse): boolean {
  return response.toolCalls.length > 0 && response.finishReason === "length";
}

function buildAssistantToolCallMessage(response: LLMResponse): AgentMessage {
  return {
    role: "assistant",
    content: response.content ?? "",
    tool_calls: response.toolCalls.map(toOpenAIToolCall)
  };
}

function toOpenAIToolCall(toolCall: ToolCallRequest): Record<string, unknown> {
  return {
    id: toolCall.id,
    type: "function",
    function: {
      name: toolCall.name,
      arguments: JSON.stringify(toolCall.arguments)
    }
  };
}

function accumulateUsage(target: Record<string, number>, addition: Record<string, number>): void {
  for (const [key, value] of Object.entries(addition)) {
    target[key] = (target[key] ?? 0) + value;
  }
}

function isBlank(value: string): boolean {
  return value.trim().length === 0;
}

function normalizeToolResult(result: unknown, maxChars: number): string {
  const text = typeof result === "string" ? result : JSON.stringify(result);
  if (text.length <= maxChars) {
    return text;
  }
  return `${text.slice(0, maxChars)}... [truncated]`;
}

function summarizeToolResult(result: string): string {
  const oneLine = result.replace(/\s+/g, " ").trim();
  if (!oneLine) {
    return "(empty)";
  }
  return oneLine.length > 120 ? `${oneLine.slice(0, 120)}...` : oneLine;
}

function dropOrphanToolResults(messages: AgentMessage[]): AgentMessage[] {
  const declared = new Set<string>();
  const kept: AgentMessage[] = [];

  for (const message of messages) {
    if (message.role === "assistant") {
      for (const toolCall of extractToolCalls(message)) {
        declared.add(toolCall.id);
      }
    }
    if (message.role === "tool") {
      const id = typeof message.tool_call_id === "string" ? message.tool_call_id : "";
      if (!id || !declared.has(id)) {
        continue;
      }
    }
    kept.push(message);
  }

  return kept;
}

function backfillMissingToolResults(messages: AgentMessage[]): AgentMessage[] {
  const fulfilled = new Set<string>();
  const declared: Array<{ assistantIndex: number; id: string; name: string }> = [];

  messages.forEach((message, index) => {
    if (message.role === "assistant") {
      for (const toolCall of extractToolCalls(message)) {
        declared.push({ assistantIndex: index, id: toolCall.id, name: toolCall.name });
      }
    }
    if (message.role === "tool" && typeof message.tool_call_id === "string") {
      fulfilled.add(message.tool_call_id);
    }
  });

  const missing = declared.filter((toolCall) => !fulfilled.has(toolCall.id));
  if (missing.length === 0) {
    return messages;
  }

  const prepared = [...messages];
  let offset = 0;
  for (const toolCall of missing) {
    let insertAt = toolCall.assistantIndex + 1 + offset;
    while (prepared[insertAt]?.role === "tool") {
      insertAt += 1;
    }
    prepared.splice(insertAt, 0, {
      role: "tool",
      tool_call_id: toolCall.id,
      name: toolCall.name,
      content: MISSING_TOOL_RESULT
    });
    offset += 1;
  }
  return prepared;
}

function compactOldToolResults(messages: AgentMessage[], keepRecent: number): AgentMessage[] {
  const compactableIndexes = messages
    .map((message, index) => ({ message, index }))
    .filter(({ message }) => message.role === "tool" && typeof message.name === "string" && COMPACTABLE_TOOLS.has(message.name));
  const stale = compactableIndexes.slice(0, Math.max(0, compactableIndexes.length - keepRecent));
  const staleIndexes = new Set(stale.map(({ index }) => index));

  return messages.map((message, index) => {
    if (!staleIndexes.has(index) || typeof message.content !== "string" || message.content.length < COMPACT_MIN_CHARS) {
      return message;
    }
    return {
      ...message,
      content: `[${String(message.name)} result omitted from context]`
    };
  });
}

function trimToContextBudget(messages: AgentMessage[], contextWindowTokens?: number): AgentMessage[] {
  if (!contextWindowTokens || contextWindowTokens <= 0) {
    return messages;
  }

  const systemMessages = messages.filter((message) => message.role === "system");
  const nonSystem = messages.filter((message) => message.role !== "system");
  const kept: AgentMessage[] = [];
  let used = estimateMessagesTokens(systemMessages);

  for (let index = nonSystem.length - 1; index >= 0; index -= 1) {
    const message = nonSystem[index];
    if (!message) {
      continue;
    }
    const tokens = estimateMessageTokens(message);
    if (kept.length > 0 && used + tokens > contextWindowTokens) {
      break;
    }
    kept.unshift(message);
    used += tokens;
  }

  const firstUserIndex = kept.findIndex((message) => message.role === "user");
  const aligned = firstUserIndex > 0 ? kept.slice(firstUserIndex) : kept;
  return [...systemMessages, ...aligned];
}

function estimateMessagesTokens(messages: AgentMessage[]): number {
  return messages.reduce((total, message) => total + estimateMessageTokens(message), 0);
}

function estimateMessageTokens(message: AgentMessage): number {
  return Math.max(1, Math.ceil(JSON.stringify(message).length / 4));
}

function extractToolCalls(message: AgentMessage): Array<{ id: string; name: string }> {
  if (!Array.isArray(message.tool_calls)) {
    return [];
  }
  return message.tool_calls.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return [];
    }
    const candidate = item as Record<string, unknown>;
    const fn = candidate.function;
    const id = candidate.id;
    if (typeof id !== "string" || !fn || typeof fn !== "object" || Array.isArray(fn)) {
      return [];
    }
    const name = (fn as Record<string, unknown>).name;
    return typeof name === "string" ? [{ id, name }] : [];
  });
}
