import type { ExecutionStep, StreamSegment } from "../hooks/useAgentSocket";

/* ------------------------------------------------------------------ */
/*  Tool step fingerprint for dedup                                   */
/* ------------------------------------------------------------------ */

/** Canonical tool key for dedup — shared between segment reducer and timeline. */
export function toolKey(title: string, detail?: string): string {
  if (title.startsWith("exec ")) {
    return `exec:${title.slice(5)}`;
  }
  if (detail) {
    try {
      const parsed = JSON.parse(detail) as Record<string, unknown>;
      if (typeof parsed.command === "string") {
        return `exec:${parsed.command}`;
      }
    } catch { /* not JSON */ }
  }
  return `${title}:${detail ?? ""}`;
}

export function toolStepKey(step: ExecutionStep): string {
  return toolKey(step.title, step.detail);
}

/* ------------------------------------------------------------------ */
/*  Segment list operations — pure functions                          */
/* ------------------------------------------------------------------ */

/** Append text to the last text segment, or start a new one. */
export function appendText(
  segments: StreamSegment[],
  text: string,
  gen: number,
  nextId: number
): StreamSegment[] {
  const last = segments[segments.length - 1];
  if (last && last.kind === "text") {
    const updated: StreamSegment = { ...last, content: last.content + text };
    return [...segments.slice(0, -1), updated];
  }
  const id = `txt-${gen}-${nextId}`;
  return [...segments, { kind: "text", id, content: text }];
}

/** Add a tool step, replacing an existing approval step if one matches by key. */
export function appendToolStep(
  segments: StreamSegment[],
  step: ExecutionStep
): StreamSegment[] {
  const replaceKey = toolStepKey(step);
  const replaceIdx = segments.findIndex(
    (s) => s.kind === "tool" && s.step.id !== step.id && toolStepKey(s.step) === replaceKey
  );
  if (replaceIdx >= 0) {
    const updated = [...segments];
    updated[replaceIdx] = { kind: "tool" as const, step };
    return updated;
  }
  return [...segments, { kind: "tool", step }];
}

/** Update a tool step by ID. */
export function updateToolStep(
  segments: StreamSegment[],
  id: string,
  patch: Partial<ExecutionStep>
): StreamSegment[] {
  return segments.map((seg) =>
    seg.kind === "tool" && seg.step.id === id
      ? { kind: "tool" as const, step: { ...seg.step, ...patch } }
      : seg
  );
}

/** Add an approval step if one doesn't already exist for the same command. */
export function segmentsWithApproval(
  segments: StreamSegment[],
  id: string,
  command: string
): StreamSegment[] {
  const key = `exec:${command}`;
  const exists = segments.some(
    (s) => s.kind === "tool" && toolStepKey(s.step) === key
  );
  if (exists) return segments;
  return [
    ...segments,
    {
      kind: "tool" as const,
      step: {
        id,
        kind: "tool" as const,
        title: `exec ${command}`,
        status: "approval" as const
      }
    }
  ];
}

/** Resolve an approval by ID (with command fallback). */
export function segmentsWithApprovalResolved(
  segments: StreamSegment[],
  approvalId: string,
  command: string,
  resolved: string
): StreamSegment[] {
  return segments.map((seg) => {
    if (seg.kind !== "tool") return seg;
    if (seg.step.id === approvalId) {
      return { ...seg, step: { ...seg.step, status: "done" as const, detail: resolved } };
    }
    // Fallback: tool_call replaced the approval step — match by command
    if (seg.step.status === "pending" && seg.step.title === "exec") {
      try {
        const args = JSON.parse(seg.step.detail ?? "{}") as Record<string, unknown>;
        if (typeof args.command === "string" && args.command === command) {
          return { ...seg, step: { ...seg.step, status: "done" as const, detail: resolved } };
        }
      } catch { /* ignore */ }
    }
    return seg;
  });
}
