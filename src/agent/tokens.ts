import type { AgentMessage } from "./AgentRunner.js";

/**
 * Estimates token counts for context-budget decisions. Pluggable so a future
 * vendor-specific tokenizer can replace the heuristic without touching callers.
 */
export interface TokenCounter {
  count(text: string): number;
}

/**
 * Dependency-free heuristic that is meaningfully closer to real tokenizers than
 * the naive `length / 4` rule. It blends a per-word subword estimate with a
 * punctuation count, since model tokenizers tend to split long words into
 * multiple pieces and emit standalone tokens for punctuation.
 *
 * It is deliberately NOT a real BPE tokenizer: this project targets DeepSeek and
 * other OpenAI-compatible backends whose tokenizers differ, so importing one
 * vendor's tokenizer would give false precision. The exact provider `usage`
 * numbers (surfaced through RunResult) remain the source of truth for billing.
 */
export class HeuristicTokenCounter implements TokenCounter {
  private static readonly CHARS_PER_SUBWORD = 4;

  count(text: string): number {
    if (!text) {
      return 0;
    }
    const trimmed = text.trim();
    if (trimmed.length === 0) {
      return 0;
    }

    let tokens = 0;
    const words = trimmed.split(/\s+/);
    for (const word of words) {
      const letters = word.replace(/[^\p{L}\p{N}]/gu, "");
      const punctuation = word.length - letters.length;
      if (letters.length > 0) {
        tokens += Math.ceil(letters.length / HeuristicTokenCounter.CHARS_PER_SUBWORD);
      }
      tokens += punctuation;
    }
    return Math.max(1, tokens);
  }
}

const PER_MESSAGE_OVERHEAD_TOKENS = 4;

/** Estimate tokens for a single message including a fixed framing overhead. */
export function estimateMessageTokens(counter: TokenCounter, message: AgentMessage): number {
  const serialized = JSON.stringify(message) ?? "";
  return PER_MESSAGE_OVERHEAD_TOKENS + counter.count(serialized);
}

/** Estimate tokens for a list of messages. */
export function estimateMessagesTokens(counter: TokenCounter, messages: AgentMessage[]): number {
  return messages.reduce((total, message) => total + estimateMessageTokens(counter, message), 0);
}
