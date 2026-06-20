import { describe, expect, it } from "vitest";

import { HeuristicTokenCounter, estimateMessagesTokens } from "../../src/agent/tokens.js";

describe("HeuristicTokenCounter", () => {
  const counter = new HeuristicTokenCounter();

  it("returns 0 for empty text", () => {
    expect(counter.count("")).toBe(0);
    expect(counter.count("   ")).toBe(0);
  });

  it("counts a handful of tokens for a short sentence", () => {
    const tokens = counter.count("The quick brown fox jumps.");
    // 5 words + 1 punctuation; allow a small range around the heuristic.
    expect(tokens).toBeGreaterThanOrEqual(5);
    expect(tokens).toBeLessThanOrEqual(9);
  });

  it("scales roughly with length and never returns below 1 for non-empty text", () => {
    const small = counter.count("hello world");
    const large = counter.count("hello world ".repeat(100));
    expect(small).toBeGreaterThanOrEqual(1);
    expect(large).toBeGreaterThan(small * 50);
  });

  it("treats long words as more than one token", () => {
    const long = counter.count("supercalifragilisticexpialidocious");
    expect(long).toBeGreaterThan(1);
  });

  it("counts message overhead and serialized tool_calls via estimateMessagesTokens", () => {
    const plain = estimateMessagesTokens(counter, [{ role: "user", content: "hi" }]);
    const withTools = estimateMessagesTokens(counter, [
      {
        role: "assistant",
        content: "",
        tool_calls: [{ id: "c1", type: "function", function: { name: "read_file", arguments: "{\"path\":\"a.ts\"}" } }]
      }
    ]);
    expect(plain).toBeGreaterThanOrEqual(1);
    expect(withTools).toBeGreaterThan(plain);
  });
});
