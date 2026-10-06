import { shouldExecuteToolCalls, type LLMProvider, type LLMResponse, type ThinkingConfig, type ToolCallRequest } from "../providers/Provider.js";
import type { ToolRegistry } from "../tools/ToolRegistry.js";
import { AgentHook, type AgentHookContext } from "./hooks.js";
import { HeuristicTokenCounter, estimateMessagesTokens, type TokenCounter } from "./tokens.js";
import type { AgentEvent } from "./events.js";

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
  outputReserveTokens?: number;
  compactToolResultsKeepRecent?: number;
  tokenCounter?: TokenCounter;
  thinking?: ThinkingConfig;
  effort?: 1 | 2 | 3 | 4;
  approveCommand?: (command: string) => Promise<boolean> | boolean;
  signal?: AbortSignal;
}

export interface AgentRunResult {
  finalContent: string | null;
  /** Aggregated reasoning / thinking content from the model. */
  reasoningContent: string | null;
  messages: AgentMessage[];
  toolsUsed: string[];
  usage: Record<string, number>;
  stopReason: "completed" | "max_iterations" | "error" | "aborted";
  error?: string;
  toolEvents: Array<{ name: string; status: "ok" | "error"; detail: string }>;
}

export class AgentRunner {
  constructor(private readonly provider: LLMProvider) {}

  async run(spec: AgentRunSpec): Promise<AgentRunResult> {
    let result: AgentRunResult | undefined;
    // run() never streams tokens: it forces the non-streaming chat() path so its
    // behavior (and provider contract) is identical to before runStream existed.
    for await (const event of this.execute(spec, false)) {
      if (event.type === "done") {
        result = event.result;
      }
    }
    // execute() always emits exactly one terminal `done` event.
    return result as AgentRunResult;
  }

  runStream(spec: AgentRunSpec): AsyncIterable<AgentEvent> {
    // Prefer the provider's streaming path so callers receive live token events.
    return this.execute(spec, true);
  }

  private async *execute(spec: AgentRunSpec, streaming: boolean): AsyncIterable<AgentEvent> {
    const messages = [...spec.initialMessages];
    const hook = spec.hook ?? new AgentHook();
    const toolsUsed: string[] = [];
    const usage: Record<string, number> = {};
    const toolEvents: AgentRunResult["toolEvents"] = [];
    let reasoningContent = "";
    let emptyFinalRetries = 0;
    let truncatedToolCallRecoveries = 0;

    for (let iteration = 0; iteration < spec.maxIterations; iteration += 1) {
      if (spec.signal?.aborted) {
        yield { type: "done", result: abortedResult(messages, toolsUsed, usage, toolEvents, reasoningContent) };
        return;
      }
      const hookContext: AgentHookContext = {
        iteration,
        messages,
        toolCalls: [],
        toolResults: []
      };
      await hook.beforeIteration(hookContext);
      let response: LLMResponse;
      const partial = { text: "" };
      try {
        response = yield* this.streamResponse(spec, messages, streaming, partial);
      } catch (error) {
        if (error instanceof ContextBudgetError) {
          throw error;
        }
        if (spec.signal?.aborted) {
          // Keep what the user already saw stream in.
          if (partial.text.trim()) {
            messages.push({ role: "assistant", content: partial.text, interrupted: "user" });
          }
          yield { type: "done", result: abortedResult(messages, toolsUsed, usage, toolEvents, reasoningContent) };
          return;
        }
        const finalContent = `Error calling LLM: ${error instanceof Error ? error.message : String(error)}`;
        messages.push({ role: "assistant", content: finalContent, interrupted: "error" });
        hookContext.finalContent = finalContent;
        hookContext.stopReason = "error";
        hookContext.error = finalContent;
        await hook.afterIteration(hookContext);
        yield { type: "error", error: finalContent };
        yield {
          type: "done",
          result: { finalContent, reasoningContent, messages, toolsUsed, usage, stopReason: "error", error: finalContent, toolEvents }
        };
        return;
      }

      accumulateUsage(usage, response.usage);
      if (response.reasoningContent) {
        reasoningContent = reasoningContent
          ? `${reasoningContent}\n${response.reasoningContent}`
          : response.reasoningContent;
      }
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
        messages.push({ role: "assistant", content: finalContent, interrupted: "error" });
        hookContext.finalContent = finalContent;
        hookContext.stopReason = "error";
        hookContext.error = finalContent;
        await hook.afterIteration(hookContext);
        yield { type: "error", error: finalContent };
        yield {
          type: "done",
          result: { finalContent, reasoningContent, messages, toolsUsed, usage, stopReason: "error", error: finalContent, toolEvents }
        };
        return;
      }

      if (shouldExecuteTools(response)) {
        messages.push(buildAssistantToolCallMessage(response));
        await hook.beforeExecuteTools(hookContext);
        for (const [index, toolCall] of response.toolCalls.entries()) {
          if (spec.signal?.aborted) {
            // Every requested call still needs a result for the history to
            // stay valid; the ones that never ran are recorded as cancelled.
            for (const skipped of response.toolCalls.slice(index)) {
              messages.push({ role: "tool", tool_call_id: skipped.id, name: skipped.name, content: CANCELLED_TOOL_RESULT });
              toolEvents.push({ name: skipped.name, status: "error", detail: CANCELLED_TOOL_RESULT });
              yield { type: "tool_result", id: skipped.id, name: skipped.name, status: "error", content: CANCELLED_TOOL_RESULT };
            }
            await hook.afterIteration(hookContext);
            yield { type: "done", result: abortedResult(messages, toolsUsed, usage, toolEvents, reasoningContent) };
            return;
          }
          yield { type: "tool_call", id: toolCall.id, name: toolCall.name, arguments: toolCall.arguments };
          toolsUsed.push(toolCall.name);
          const result = await spec.tools.execute(
            toolCall.name,
            toolCall.arguments,
            { workspace: spec.workspace ?? process.cwd(), approveCommand: spec.approveCommand, signal: spec.signal }
          );
          const content = normalizeToolResult(result, spec.maxToolResultChars);
          hookContext.toolResults.push(content);
          messages.push({
            role: "tool",
            tool_call_id: toolCall.id,
            name: toolCall.name,
            content
          });
          const status = typeof content === "string" && content.startsWith("Error") ? "error" : "ok";
          toolEvents.push({ name: toolCall.name, status, detail: summarizeToolResult(content) });
          yield { type: "tool_result", id: toolCall.id, name: toolCall.name, status, content };
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
      yield {
        type: "done",
        result: { finalContent, reasoningContent, messages, toolsUsed, usage, stopReason: "completed", toolEvents }
      };
      return;
    }

    const finalContent = "Maximum tool iterations reached.";
    messages.push({ role: "assistant", content: finalContent });
    yield {
      type: "done",
      result: { finalContent, reasoningContent, messages, toolsUsed, usage, stopReason: "max_iterations", toolEvents }
    };
  }

  /**
   * Issue one provider call. When `streaming` is requested and the provider
   * supports it, yields `token` events as content arrives and returns the
   * assembled response. Otherwise issues a single non-streaming `chat()` call
   * (no token events). The generator's return value is the final LLMResponse.
   */
  private async *streamResponse(
    spec: AgentRunSpec,
    messages: AgentMessage[],
    streaming: boolean,
    partial: { text: string }
  ): AsyncGenerator<AgentEvent, LLMResponse> {
    const request = {
      messages: prepareMessagesForModel(messages, spec),
      tools: spec.tools.getDefinitions(),
      model: spec.model,
      signal: spec.signal,
      thinking: spec.thinking,
      effort: spec.effort
    };
    if (streaming && typeof this.provider.chatStream === "function") {
      let assembled: LLMResponse | undefined;
      for await (const event of this.provider.chatStream(request)) {
        if (event.type === "delta") {
          if (event.content.length > 0) {
            partial.text += event.content;
            yield { type: "token", text: event.content };
          }
        } else if (event.type === "reasoning") {
          if (event.content.length > 0) {
            yield { type: "thinking", text: event.content };
          }
        } else {
          assembled = event.response;
        }
      }
      if (!assembled) {
        throw new Error("Streaming provider ended without a final response");
      }
      return assembled;
    }
    return this.provider.chat(request);
  }
}

export class ContextBudgetError extends Error {
  readonly code = "context_budget";

  constructor(required: number, available: number) {
    super(`Required context needs ${required} tokens, but the model window allows ${available}.`);
    this.name = "ContextBudgetError";
  }
}

const MISSING_TOOL_RESULT = "[Tool result unavailable - call was interrupted or lost]";
const DEFAULT_COMPACT_KEEP_RECENT = 10;
const COMPACT_MIN_CHARS = 500;

const ABORTED_MESSAGE = "Run aborted by caller.";
const CANCELLED_TOOL_RESULT = "Error: cancelled - the user interrupted the turn before this tool ran.";

function abortedResult(
  messages: AgentMessage[],
  toolsUsed: string[],
  usage: Record<string, number>,
  toolEvents: AgentRunResult["toolEvents"],
  reasoningContent: string
): AgentRunResult {
  return {
    finalContent: ABORTED_MESSAGE,
    reasoningContent,
    messages,
    toolsUsed,
    usage,
    stopReason: "aborted",
    toolEvents
  };
}

function prepareMessagesForModel(messages: AgentMessage[], spec: AgentRunSpec): AgentMessage[] {
  const counter = spec.tokenCounter ?? new HeuristicTokenCounter();
  let prepared = messages.map((message) => ({ ...message }));
  prepared = dropOrphanToolResults(prepared);
  prepared = backfillMissingToolResults(prepared);
  prepared = compactOldToolResults(prepared, spec.tools, spec.compactToolResultsKeepRecent ?? DEFAULT_COMPACT_KEEP_RECENT);
  prepared = trimToContextBudget(prepared, counter, spec);
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

function compactOldToolResults(messages: AgentMessage[], tools: ToolRegistry, keepRecent: number): AgentMessage[] {
  const compactableIndexes = messages
    .map((message, index) => ({ message, index }))
    .filter(({ message }) => message.role === "tool" && typeof message.name === "string" && tools.get(message.name)?.compactable === true);
  const stale = compactableIndexes.slice(0, Math.max(0, compactableIndexes.length - keepRecent));
  const staleIndexes = new Set(stale.map(({ index }) => index));

  return messages.map((message, index) => {
    if (!staleIndexes.has(index) || typeof message.content !== "string" || message.content.length < COMPACT_MIN_CHARS) {
      return message;
    }
    return {
      ...message,
      content: `[${String(message.name)} result summarized: ${summarizeToolResult(message.content)}]`
    };
  });
}

function trimToContextBudget(messages: AgentMessage[], counter: TokenCounter, spec: AgentRunSpec): AgentMessage[] {
  const contextWindowTokens = spec.contextWindowTokens;
  if (!contextWindowTokens || contextWindowTokens <= 0) {
    return messages;
  }

  const systemMessages = messages.filter((message) => message.role === "system");
  const nonSystem = messages.filter((message) => message.role !== "system");
  const turns = groupUserTurns(nonSystem);
  const currentTurn = turns.at(-1) ?? [];
  const toolDefinitionTokens = counter.count(JSON.stringify(spec.tools.getDefinitions()));
  const outputReserve = spec.outputReserveTokens ?? 0;
  const required = estimateMessagesTokens(counter, [...systemMessages, ...currentTurn]) + toolDefinitionTokens + outputReserve;
  if (required > contextWindowTokens) {
    throw new ContextBudgetError(required, contextWindowTokens);
  }

  const keptTurns: AgentMessage[][] = [currentTurn];
  let used = required;
  for (let index = turns.length - 2; index >= 0; index -= 1) {
    const turn = turns[index]!;
    const tokens = estimateMessagesTokens(counter, turn);
    if (used + tokens > contextWindowTokens) break;
    keptTurns.unshift(turn);
    used += tokens;
  }
  return [...systemMessages, ...keptTurns.flat()];
}

function groupUserTurns(messages: AgentMessage[]): AgentMessage[][] {
  const turns: AgentMessage[][] = [];
  let current: AgentMessage[] = [];
  for (const message of messages) {
    if (message.role === "user" && current.length > 0) {
      if (current.some((item) => item.role === "user")) turns.push(current);
      current = [];
    }
    current.push(message);
  }
  if (current.some((item) => item.role === "user")) turns.push(current);
  return turns;
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
