import { describe, expect, it } from "vitest";

import type { MessageRecord } from "@/api/types";
import type { StreamSegment } from "@/hooks/useAgentSocket";
import { toolKey } from "@/lib/segmentReducer";
import { buildTimeline, extractToolSteps, renderContent } from "@/lib/timeline";

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function msg(overrides: Partial<MessageRecord> = {}): MessageRecord {
  return {
    role: "user",
    content: "",
    timestamp: "2026-01-01T00:00:00.000Z",
    ...overrides
  };
}

function toolCallMsg(id: string, name: string, args: Record<string, unknown>): MessageRecord {
  return msg({
    role: "assistant",
    content: "",
    tool_calls: [{ id, function: { name, arguments: JSON.stringify(args) } }]
  });
}

function toolResultMsg(callId: string, content: string): MessageRecord {
  return msg({ role: "tool", content, tool_call_id: callId });
}

function textSeg(id: string, content: string): StreamSegment {
  return { kind: "text", id, content };
}

function toolSeg(id: string, title: string, status: "pending" | "ok" | "error" | "approval" | "done" = "pending", detail?: string): StreamSegment {
  return { kind: "tool", step: { id, kind: "tool", title, status, detail } };
}

/* ------------------------------------------------------------------ */
/*  renderContent                                                      */
/* ------------------------------------------------------------------ */

describe("renderContent", () => {
  it("returns strings as-is", () => {
    expect(renderContent("hello")).toBe("hello");
  });

  it("JSON-stringifies objects", () => {
    expect(renderContent({ a: 1 })).toBe('{\n  "a": 1\n}');
  });

  it("JSON-stringifies arrays", () => {
    expect(renderContent([1, 2, 3])).toBe('[\n  1,\n  2,\n  3\n]');
  });
});

/* ------------------------------------------------------------------ */
/*  toolKey                                                    */
/* ------------------------------------------------------------------ */

describe("toolKey", () => {
  it("extracts command from exec title", () => {
    expect(toolKey("exec npm test")).toBe("exec:npm test");
  });

  it("extracts command from detail JSON", () => {
    expect(toolKey("run", JSON.stringify({ command: "ls -la" }))).toBe("exec:ls -la");
  });

  it("falls back to title:detail prefix", () => {
    expect(toolKey("read_file", "some detail here that is long")).toBe("read_file:some detail here that is long");
  });
});

/* ------------------------------------------------------------------ */
/*  extractToolSteps                                                    */
/* ------------------------------------------------------------------ */

describe("extractToolSteps", () => {
  it("returns empty for no tool calls", () => {
    expect(extractToolSteps([])).toEqual([]);
    expect(extractToolSteps([msg({ role: "user", content: "hi" })])).toEqual([]);
  });

  it("parses tool calls from assistant messages", () => {
    const messages = [toolCallMsg("call-1", "read_file", { path: "a.ts" })];
    const steps = extractToolSteps(messages);
    expect(steps).toHaveLength(1);
    expect(steps[0]!.id).toBe("call-1");
    expect(steps[0]!.title).toBe("read_file");
    expect(steps[0]!.status).toBe("pending");
  });

  it("resolves tool status from tool result messages", () => {
    const messages = [
      toolCallMsg("call-1", "search", { query: "test" }),
      toolResultMsg("call-1", "found 3 results")
    ];
    const steps = extractToolSteps(messages);
    expect(steps).toHaveLength(1);
    expect(steps[0]!.status).toBe("ok");
    expect(steps[0]!.result).toBe("found 3 results");
  });

  it("handles non-array tool_calls", () => {
    const m = msg({
      role: "assistant",
      content: "",
      tool_calls: { id: "single", function: { name: "exec", arguments: '{"cmd":"ls"}' } }
    });
    const steps = extractToolSteps([m]);
    expect(steps).toHaveLength(1);
    expect(steps[0]!.title).toBe("exec");
  });
});

/* ------------------------------------------------------------------ */
/*  buildTimeline                                                      */
/* ------------------------------------------------------------------ */

describe("buildTimeline", () => {
  it("returns empty for no messages or segments", () => {
    expect(buildTimeline([], [], [], "")).toEqual([]);
  });

  it("renders user and assistant messages", () => {
    const messages = [
      msg({ role: "user", content: "hello" }),
      msg({ role: "assistant", content: "hi there" })
    ];
    const timeline = buildTimeline(messages, [], [], "");
    expect(timeline).toHaveLength(2);
    expect(timeline[0]!.kind).toBe("user");
    expect(timeline[1]!.kind).toBe("assistant");
  });

  it("adds current user message when not yet persisted", () => {
    const messages = [msg({ role: "assistant", content: "old" })];
    const timeline = buildTimeline(messages, [], [], "new message");
    const userItems = timeline.filter((i) => i.kind === "user");
    expect(userItems).toHaveLength(1);
    expect(userItems[0]!.content).toBe("new message");
  });

  it("does not duplicate current user message if already persisted", () => {
    const messages = [msg({ role: "user", content: "already here" })];
    const timeline = buildTimeline(messages, [], [], "already here");
    const userItems = timeline.filter((i) => i.kind === "user");
    expect(userItems).toHaveLength(1);
  });

  it("interleaves live text and tool segments", () => {
    const messages: MessageRecord[] = [];
    const segments: StreamSegment[] = [
      textSeg("txt-1", "Let me check that."),
      toolSeg("tool-1", "read_file"),
      textSeg("txt-2", "Done.")
    ];
    const timeline = buildTimeline(messages, [], segments, "");
    expect(timeline).toHaveLength(3);
    expect(timeline[0]!.kind).toBe("assistant");
    expect(timeline[1]!.kind).toBe("tool");
    expect(timeline[2]!.kind).toBe("assistant");
  });

  it("skips live segments when draft is already persisted", () => {
    const messages = [
      msg({ role: "user", content: "check" }),
      msg({ role: "assistant", content: "Let me check that.Done." })
    ];
    const segments: StreamSegment[] = [
      textSeg("txt-1", "Let me check that."),
      textSeg("txt-2", "Done.")
    ];
    const timeline = buildTimeline(messages, [], segments, "");
    // Should only show persisted messages, no live duplicates
    expect(timeline).toHaveLength(2);
    expect(timeline[0]!.kind).toBe("user");
    expect(timeline[1]!.kind).toBe("assistant");
  });

  it("deduplicates tool calls already in live segments", () => {
    const messages = [
      toolCallMsg("persisted-1", "read_file", { path: "x.ts" })
    ];
    const toolSteps = extractToolSteps(messages);
    const segments: StreamSegment[] = [
      toolSeg("persisted-1", "read_file", "pending", '{\n  "path": "x.ts"\n}')
    ];
    const timeline = buildTimeline(messages, toolSteps, segments, "");
    // The live tool segment with the same ID should suppress the persisted one
    const toolItems = timeline.filter((i) => i.kind === "tool");
    expect(toolItems.length).toBeLessThanOrEqual(1);
  });
});
