import { describe, expect, it } from "vitest";

import {
  isToolCapableFinishReason,
  normalizeFinishReason,
  shouldExecuteToolCalls
} from "../../src/providers/Provider.js";

describe("provider finish reasons", () => {
  it("normalizes known finish reasons and preserves unknown values as unknown", () => {
    expect(normalizeFinishReason("tool_calls")).toBe("tool_calls");
    expect(normalizeFinishReason("function_call")).toBe("function_call");
    expect(normalizeFinishReason("stop")).toBe("stop");
    expect(normalizeFinishReason("length")).toBe("length");
    expect(normalizeFinishReason("content_filter")).toBe("content_filter");
    expect(normalizeFinishReason("refusal")).toBe("refusal");
    expect(normalizeFinishReason("error")).toBe("error");
    expect(normalizeFinishReason("unexpected")).toBe("unknown");
    expect(normalizeFinishReason(null)).toBe("unknown");
  });

  it("separates finish reasons that can safely execute tool calls", () => {
    expect(isToolCapableFinishReason("tool_calls")).toBe(true);
    expect(isToolCapableFinishReason("function_call")).toBe(true);
    expect(isToolCapableFinishReason("stop")).toBe(true);

    expect(isToolCapableFinishReason("length")).toBe(false);
    expect(isToolCapableFinishReason("content_filter")).toBe(false);
    expect(isToolCapableFinishReason("refusal")).toBe(false);
    expect(isToolCapableFinishReason("error")).toBe(false);
    expect(isToolCapableFinishReason("unknown")).toBe(false);
  });

  it("requires both tool calls and a tool-capable finish reason", () => {
    expect(shouldExecuteToolCalls({
      content: null,
      toolCalls: [{ id: "call_1", name: "read_file", arguments: {} }],
      finishReason: "tool_calls",
      usage: {}
    })).toBe(true);

    expect(shouldExecuteToolCalls({
      content: null,
      toolCalls: [{ id: "call_1", name: "read_file", arguments: {} }],
      finishReason: "length",
      usage: {}
    })).toBe(false);

    expect(shouldExecuteToolCalls({
      content: "done",
      toolCalls: [],
      finishReason: "tool_calls",
      usage: {}
    })).toBe(false);
  });
});
