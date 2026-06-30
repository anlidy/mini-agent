import { useEffect, useMemo, useRef, useState } from "react";

import type { MessageRecord } from "../api/types";
import type { ApprovalRequest, StreamSegment } from "../hooks/useAgentSocket";
import ApprovalCard from "./ApprovalCard";
import Composer from "./Composer";
import Markdown from "./Markdown";
import ToolCallCard, { type ToolStep } from "./ToolCallCard";

/* ------------------------------------------------------------------ */
/*  Timeline item type                                                */
/* ------------------------------------------------------------------ */

type TimelineItem =
  | { kind: "user"; id: string; content: string }
  | { kind: "assistant"; id: string; content: string }
  | { kind: "tool"; id: string; step: ToolStep };

/* ------------------------------------------------------------------ */
/*  Parse persisted messages into tool steps                          */
/* ------------------------------------------------------------------ */

interface ParsedToolStep {
  id: string;
  title: string;
  status: ToolStep["status"];
  args?: string;
  result?: string;
}

function extractToolSteps(messages: MessageRecord[]): ParsedToolStep[] {
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
/*  Build a chronologically-interleaved timeline                      */
/* ------------------------------------------------------------------ */

function buildTimeline(
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

  // Combined text of all live text segments — for dedup after session refresh
  const combinedDraft = segments
    .filter((s) => s.kind === "text")
    .map((s) => s.content)
    .join("");

  const isDraftPersisted = Boolean(
    combinedDraft &&
      messages.some(
        (m) =>
          m.role === "assistant" &&
          typeof m.content === "string" &&
          m.content === combinedDraft
      )
  );

  // 1) Walk through persisted messages and interleave tool steps
  for (const msg of messages) {
    if (msg.role === "user") {
      items.push({ kind: "user", id: msg.timestamp, content: renderContent(msg.content) });
      continue;
    }

    if (msg.role === "assistant") {
      if (typeof msg.content === "string" && msg.content.trim()) {
        items.push({ kind: "assistant", id: msg.timestamp, content: msg.content });
      }
      if (msg.tool_calls && Array.isArray(msg.tool_calls)) {
        for (const call of msg.tool_calls) {
          const id = (call as Record<string, unknown>).id as string;
          const found = toolSteps.find((s) => s.id === id);
          if (found && !liveStepIds.has(id)) {
            items.push({
              kind: "tool",
              id: found.id,
              step: {
                id: found.id,
                kind: "tool",
                title: found.title,
                status: found.status,
                detail: found.result ?? found.args
              }
            });
          }
        }
      }
      continue;
    }
  }

  // 2) Current user message — AFTER persisted messages, and only if not already present
  if (currentUserMessage && !messages.some(
    (m) => m.role === "user" && renderContent(m.content) === currentUserMessage
  )) {
    items.push({ kind: "user", id: "current", content: currentUserMessage });
  }

  // 3) Live segments — interleaved text and tool steps in stream order
  for (const seg of segments) {
    if (seg.kind === "text") {
      if (!isDraftPersisted) {
        items.push({ kind: "assistant", id: seg.id, content: seg.content });
      }
    } else {
      // Tool segment — persisted loop already skips duplicates via liveStepIds
      items.push({ kind: "tool", id: seg.step.id, step: seg.step });
    }
  }

  return items;
}

function renderContent(content: unknown): string {
  if (typeof content === "string") return content;
  return JSON.stringify(content, null, 2);
}

/* ------------------------------------------------------------------ */
/*  Tool group — wraps consecutive tool calls                        */
/* ------------------------------------------------------------------ */

function ToolGroup({ steps }: { steps: ToolStep[] }) {
  const [expanded, setExpanded] = useState(false);

  // Single tool: no group wrapper, no indent
  if (steps.length === 1) {
    return <ToolCallCard step={steps[0]!} isLast={true} nested={false} />;
  }

  const running = steps.filter((s) => s.status === "pending" || s.status === "approval").length;

  return (
    <div>
      {/* Group header — no indent, aligned with text */}
      <button
        className="group inline-flex items-center gap-1 rounded px-1.5 leading-relaxed text-muted hover:bg-line/30 -ml-0.5"
        onClick={() => setExpanded((v) => !v)}
        type="button"
      >
        <span className="font-mono text-[11px] font-medium">[tools]</span>
        <span className="text-[11px]">({steps.length})</span>
        {running > 0 && (
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-accent animate-pulse" />
        )}
        <span className="text-[10px]">{expanded ? "▾" : "▸"}</span>
      </button>

      {/* Expanded children — indented with vertical lines */}
      {expanded && (
        <div>
          {steps.map((step, i) => (
            <ToolCallCard
              key={step.id}
              step={step}
              isLast={i === steps.length - 1}
              nested
            />
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Render timeline with tool grouping                               */
/* ------------------------------------------------------------------ */

function renderTimeline(timeline: TimelineItem[]) {
  const result: React.ReactNode[] = [];
  let toolBuffer: ToolStep[] = [];

  function flushTools() {
    if (toolBuffer.length > 0) {
      result.push(<ToolGroup key={toolBuffer[0]!.id} steps={[...toolBuffer]} />);
      toolBuffer = [];
    }
  }

  for (let i = 0; i < timeline.length; i++) {
    const item = timeline[i]!;

    if (item.kind === "user") {
      flushTools();
      result.push(
        <div key={item.id} className="mb-6 ml-auto w-fit max-w-[85%]">
          <div className="whitespace-pre-wrap rounded-2xl rounded-br-md bg-accent-soft px-4 py-2.5 text-sm leading-relaxed text-text">
            {item.content}
          </div>
        </div>
      );
      continue;
    }

    if (item.kind === "assistant") {
      flushTools();
      const nextIsTool = i + 1 < timeline.length && timeline[i + 1]!.kind === "tool";
      result.push(
        <div key={item.id} className={`max-w-[90%] ${nextIsTool ? "mb-0" : "mb-5"}`}>
          <div className="text-sm leading-relaxed text-text">
            <Markdown>{item.content}</Markdown>
          </div>
        </div>
      );
      continue;
    }

    // tool
    toolBuffer.push(item.step);
  }
  flushTools();

  return result;
}

/* ------------------------------------------------------------------ */
/*  Component                                                         */
/* ------------------------------------------------------------------ */

interface ChatThreadProps {
  sessionKey: string;
  messages: MessageRecord[];
  segments: StreamSegment[];
  approval?: ApprovalRequest;
  connected: boolean;
  active: boolean;
  aborting: boolean;
  error?: string;
  onSend(text: string): boolean;
  onApprove(approved: boolean): void;
  onAbort(): void;
}

export default function ChatThread(props: ChatThreadProps) {
  const [draft, setDraft] = useState("");
  const [currentUserMessage, setCurrentUserMessage] = useState("");
  const wasActiveRef = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (wasActiveRef.current && !props.active && !props.error) {
      setDraft("");
    }
    wasActiveRef.current = props.active;
  }, [props.active, props.error]);

  useEffect(() => {
    setCurrentUserMessage("");
  }, [props.sessionKey]);

  // Clear currentUserMessage once it's been persisted to the session
  useEffect(() => {
    if (currentUserMessage && props.messages.some(
      (m) => m.role === "user" && renderContent(m.content) === currentUserMessage
    )) {
      setCurrentUserMessage("");
    }
  }, [props.messages, currentUserMessage]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [props.messages, props.segments]);

  const toolSteps = useMemo(
    () => extractToolSteps(props.messages),
    [props.messages]
  );

  const timeline = useMemo(
    () => buildTimeline(props.messages, toolSteps, props.segments, currentUserMessage),
    [props.messages, toolSteps, props.segments, currentUserMessage]
  );

  return (
    <div className="flex h-full min-w-0 flex-col">
      {/* Messages area — scrolls full width, content centered inside */}
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[800px] px-5 py-6">
          {timeline.length === 0 && !props.active && (
            <div className="flex h-full items-center justify-center">
              <div className="text-center">
                <div className="mb-3 text-3xl">🤖</div>
                <p className="text-sm text-muted">Send a message to get started</p>
              </div>
            </div>
          )}

          {renderTimeline(timeline)}

          {props.error ? (
            <div className="rounded-lg bg-red/10 p-3 text-sm text-red">{props.error}</div>
          ) : null}
        </div>
      </div>

      <ApprovalCard approval={props.approval} onResolve={props.onApprove} />

      <div className="mx-auto w-full max-w-[800px] px-5">
        <Composer
          disabled={props.active || !props.connected}
          value={draft}
          onChange={setDraft}
          active={props.active}
          aborting={props.aborting}
          onAbort={props.onAbort}
          onSend={(text) => {
            const accepted = props.onSend(text);
            if (accepted) {
              setDraft("");
              setCurrentUserMessage(text);
              wasActiveRef.current = true;
            }
          }}
        />
      </div>
    </div>
  );
}
