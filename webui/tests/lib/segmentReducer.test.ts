import { describe, expect, it } from "vitest";

import type { ExecutionStep, StreamSegment } from "@/hooks/useAgentSocket";
import {
  appendText,
  appendToolStep,
  segmentsWithApproval,
  segmentsWithApprovalResolved,
  toolStepKey,
  updateToolStep
} from "@/lib/segmentReducer";

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function textSeg(id: string, content: string): StreamSegment {
  return { kind: "text", id, content };
}

function toolSeg(id: string, title: string, status: ExecutionStep["status"] = "pending", detail?: string): StreamSegment {
  return { kind: "tool", step: { id, kind: "tool", title, status, detail } };
}

function approvalStep(id: string, command: string): ExecutionStep {
  return { id, kind: "tool", title: `exec ${command}`, status: "approval" };
}

/* ------------------------------------------------------------------ */
/*  toolStepKey                                                        */
/* ------------------------------------------------------------------ */

describe("toolStepKey", () => {
  it("extracts command from exec title", () => {
    expect(toolStepKey({ id: "1", kind: "tool", title: "exec npm test", status: "pending" }))
      .toBe("exec:npm test");
  });

  it("extracts command from detail JSON", () => {
    expect(toolStepKey({
      id: "1", kind: "tool", title: "run",
      status: "pending", detail: JSON.stringify({ command: "ls" })
    })).toBe("exec:ls");
  });

  it("falls back to title:detail", () => {
    expect(toolStepKey({
      id: "1", kind: "tool", title: "read_file",
      status: "pending", detail: "/path/to/file"
    })).toBe("read_file:/path/to/file");
  });
});

/* ------------------------------------------------------------------ */
/*  appendText                                                         */
/* ------------------------------------------------------------------ */

describe("appendText", () => {
  it("starts a new text segment when list is empty", () => {
    const result = appendText([], "hello", 1, 1);
    expect(result).toHaveLength(1);
    expect(result[0]!.kind).toBe("text");
    expect((result[0] as { content: string }).content).toBe("hello");
  });

  it("appends to the last text segment", () => {
    const segments = [textSeg("txt-1-1", "hello")];
    const result = appendText(segments, " world", 1, 2);
    expect(result).toHaveLength(1);
    expect((result[0] as { content: string }).content).toBe("hello world");
  });

  it("starts a new text segment after a tool segment", () => {
    const segments = [toolSeg("tool-1", "read_file")];
    const result = appendText(segments, "Result:", 1, 1);
    expect(result).toHaveLength(2);
    expect(result[1]!.kind).toBe("text");
    expect((result[1] as { content: string }).content).toBe("Result:");
  });
});

/* ------------------------------------------------------------------ */
/*  appendToolStep                                                     */
/* ------------------------------------------------------------------ */

describe("appendToolStep", () => {
  it("adds a new tool segment", () => {
    const result = appendToolStep([], {
      id: "t1", kind: "tool", title: "read_file", status: "pending"
    });
    expect(result).toHaveLength(1);
    expect(result[0]!.kind).toBe("tool");
  });

  it("replaces an existing approval step with matching command", () => {
    const segments = [toolSeg("approval-1", "exec ls", "approval")];
    const result = appendToolStep(segments, {
      id: "call-1", kind: "tool", title: "exec", status: "pending",
      detail: JSON.stringify({ command: "ls" })
    });
    expect(result).toHaveLength(1);
    expect((result[0] as { kind: "tool"; step: ExecutionStep }).step.id).toBe("call-1");
  });
});

/* ------------------------------------------------------------------ */
/*  updateToolStep                                                     */
/* ------------------------------------------------------------------ */

describe("updateToolStep", () => {
  it("updates a matching tool step by ID", () => {
    const segments = [toolSeg("t1", "read_file")];
    const result = updateToolStep(segments, "t1", { status: "ok", detail: "content here" });
    expect((result[0] as { kind: "tool"; step: ExecutionStep }).step.status).toBe("ok");
    expect((result[0] as { kind: "tool"; step: ExecutionStep }).step.detail).toBe("content here");
  });

  it("leaves non-matching segments unchanged", () => {
    const segments = [toolSeg("t1", "a"), toolSeg("t2", "b")];
    const result = updateToolStep(segments, "t1", { status: "error" });
    expect((result[1] as { kind: "tool"; step: ExecutionStep }).step.status).toBe("pending");
  });

  it("ignores text segments", () => {
    const segments = [textSeg("txt-1", "hello")];
    const result = updateToolStep(segments, "t1", { status: "ok" });
    expect(result).toEqual(segments);
  });
});

/* ------------------------------------------------------------------ */
/*  segmentsWithApproval                                               */
/* ------------------------------------------------------------------ */

describe("segmentsWithApproval", () => {
  it("adds an approval step when none exists for that command", () => {
    const result = segmentsWithApproval([], "a1", "npm test");
    expect(result).toHaveLength(1);
    expect((result[0] as { kind: "tool"; step: ExecutionStep }).step.status).toBe("approval");
    expect((result[0] as { kind: "tool"; step: ExecutionStep }).step.title).toBe("exec npm test");
  });

  it("does not duplicate if an approval step already exists", () => {
    const step = approvalStep("a1", "npm test");
    const segments: StreamSegment[] = [{ kind: "tool", step }];
    const result = segmentsWithApproval(segments, "a2", "npm test");
    expect(result).toHaveLength(1);
  });
});

/* ------------------------------------------------------------------ */
/*  segmentsWithApprovalResolved                                       */
/* ------------------------------------------------------------------ */

describe("segmentsWithApprovalResolved", () => {
  it("resolves an approval step by ID", () => {
    const segments = [toolSeg("a1", "exec npm test", "approval")];
    const result = segmentsWithApprovalResolved(segments, "a1", "npm test", "approved");
    expect((result[0] as { kind: "tool"; step: ExecutionStep }).step.status).toBe("done");
    expect((result[0] as { kind: "tool"; step: ExecutionStep }).step.detail).toBe("approved");
  });

  it("resolves by command fallback when IDs differ", () => {
    // tool_call replaced the approval step with a different ID
    const segments = [toolSeg("call-1", "exec", "pending", JSON.stringify({ command: "npm test" }))];
    const result = segmentsWithApprovalResolved(segments, "approval-1", "npm test", "denied");
    expect((result[0] as { kind: "tool"; step: ExecutionStep }).step.status).toBe("done");
    expect((result[0] as { kind: "tool"; step: ExecutionStep }).step.detail).toBe("denied");
  });
});
