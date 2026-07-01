import type { MessageRecord } from "../api/types";
import type { StreamSegment } from "../hooks/useAgentSocket";
import type { ToolStep } from "../components/ToolCallCard";
import { toolKey } from "./segmentReducer";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type TimelineItem =
  | { kind: "user"; id: string; content: string }
  | { kind: "assistant"; id: string; content: string }
  | { kind: "tool"; id: string; step: ToolStep };

export interface ParsedToolStep {
  id: string;
  title: string;
  status: ToolStep["status"];
  args?: string;
  result?: string;
}

/* ------------------------------------------------------------------ */
/*  Parse persisted messages into tool steps                           */
/* ------------------------------------------------------------------ */

export function extractToolSteps(messages: MessageRecord[]): ParsedToolStep[] {
  const steps = new Map<string, ParsedToolStep>();

  for (const msg of messages) {
    if (msg.role === "assistant" && msg.tool_calls) {
      const calls = Array.isArray(msg.tool_calls) ? msg.tool_calls : [msg.tool_calls];
      for (const call of calls) {
        if (call && typeof call === "object") {
          const id = (call as Record<string, unknown>).id as string;
          const fn = (call as Record<string, unknown>).function as Record<string, unknown> | undefined;
          const name = (fn?.name as string) ?? "unknown";
          const args = typeof fn?.arguments === "string" ? fn.arguments : JSON.stringify(fn?.arguments ?? {}, null, 2);
          if (id) {
            steps.set(id, { id, title: name, status: "pending", args });
          }
        }
      }
    }

    if (msg.role === "tool" && msg.tool_call_id && typeof msg.content === "string") {
      const step = steps.get(msg.tool_call_id);
      if (step) {
        step.result = msg.content;
        step.status = "ok";
      }
    }
  }

  return Array.from(steps.values());
}

/* ------------------------------------------------------------------ */
/*  Render content helper                                              */
/* ------------------------------------------------------------------ */

export function renderContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (content === undefined || content === null) return "";
  return JSON.stringify(content, null, 2);
}

/* ------------------------------------------------------------------ */
/*  Build a chronologically-interleaved timeline                       */
/* ------------------------------------------------------------------ */

export function buildTimeline(
  messages: MessageRecord[],
  toolSteps: ParsedToolStep[],
  segments: StreamSegment[],
  currentUserMessage: string
): TimelineItem[] {
  const items: TimelineItem[] = [];

  // IDs of live tool segments — used to dedup persisted tool steps
  const liveStepIds = new Set(
    segments.filter((s) => s.kind === "tool").map((s) => s.step.id)
  );

  const seenToolKeys = new Set<string>();

  // Combined text of all live text segments — for dedup after session refresh.
  const combinedDraft = segments
    .filter((s) => s.kind === "text")
    .map((s) => s.content)
    .join("");

  const norm = (s: string) => s.replace(/\s+/g, " ").trim();
  const normDraft = norm(combinedDraft);

  // Compare against ALL assistant text in the latest turn (after the last
  // user message).
  const lastUserIdx = messages.reduce((max, m, i) => (m.role === "user" ? i : max), -1);
  const turnAssistantText = messages
    .slice(lastUserIdx + 1)
    .filter((m) => m.role === "assistant" && typeof m.content === "string")
    .map((m) => m.content as string)
    .join("");

  const isDraftPersisted = Boolean(
    normDraft && turnAssistantText && norm(turnAssistantText) === normDraft
  );

  // Shared: walk persisted messages → timeline items.
  // When skipLiveIds is provided, tool steps whose IDs appear in the set
  // are skipped (they will be rendered from live segments instead).
  function appendMessages(
    dest: TimelineItem[],
    opts?: { skipLiveIds?: Set<string>; trackSeenKeys?: Set<string> }
  ) {
    for (let mi = 0; mi < messages.length; mi++) {
      const msg = messages[mi]!;
      if (msg.role === "user") {
        dest.push({
          kind: "user",
          id: `m${mi}-${msg.timestamp}`,
          content: renderContent(msg.content)
        });
        continue;
      }

      if (msg.role === "assistant") {
        if (typeof msg.content === "string" && msg.content.trim()) {
          dest.push({
            kind: "assistant",
            id: `m${mi}-${msg.timestamp}`,
            content: msg.content
          });
        }
        if (msg.tool_calls && Array.isArray(msg.tool_calls)) {
          for (const call of msg.tool_calls) {
            const id = (call as Record<string, unknown>).id as string;
            if (opts?.skipLiveIds?.has(id)) continue;
            const found = toolSteps.find((s) => s.id === id);
            if (found) {
              const step: ToolStep = {
                id: found.id,
                kind: "tool",
                title: found.title,
                status: found.status,
                detail: found.result ?? found.args,
                detailKind: found.result ? "result" : "args"
              };
              opts?.trackSeenKeys?.add(toolKey(step.title, step.detail));
              dest.push({ kind: "tool", id: found.id, step });
            }
          }
        }
        continue;
      }
    }
  }

  // When the draft is already persisted, skip ALL live segments.
  if (isDraftPersisted) {
    appendMessages(items);
    return items;
  }

  // --- Live turn: merge persisted history with streaming segments ---
  appendMessages(items, { skipLiveIds: liveStepIds, trackSeenKeys: seenToolKeys });

  // 2) Current user message — AFTER persisted messages, deduped
  if (currentUserMessage && !messages.some(
    (m) => m.role === "user" && renderContent(m.content) === currentUserMessage
  )) {
    items.push({ kind: "user", id: "current", content: currentUserMessage });
  }

  // 3) Live segments — interleaved text and tool steps in stream order
  for (const seg of segments) {
    if (seg.kind === "text") {
      items.push({ kind: "assistant", id: seg.id, content: seg.content });
    } else {
      const key = toolKey(seg.step.title, seg.step.detail);
      if (!seenToolKeys.has(key)) {
        items.push({ kind: "tool", id: seg.step.id, step: seg.step });
      }
    }
  }

  return items;
}
