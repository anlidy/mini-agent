import { useEffect, useMemo, useRef, useState } from "react";

import type { MessageRecord } from "../api/types";
import type { ApprovalRequest, StreamSegment } from "../hooks/useAgentSocket";
import { buildTimeline, extractToolSteps, renderContent } from "../lib/timeline";
import ApprovalCard from "./ApprovalCard";
import Composer from "./Composer";
import TimelineRenderer from "./TimelineRenderer";

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

  // Clear draft when turn completes
  useEffect(() => {
    if (wasActiveRef.current && !props.active && !props.error) {
      setDraft("");
    }
    wasActiveRef.current = props.active;
  }, [props.active, props.error]);

  // Clear user message on session change
  useEffect(() => {
    setCurrentUserMessage("");
  }, [props.sessionKey]);

  // Clear currentUserMessage once persisted to the session
  useEffect(() => {
    if (currentUserMessage && props.messages.some(
      (m) => m.role === "user" && renderContent(m.content) === currentUserMessage
    )) {
      setCurrentUserMessage("");
    }
  }, [props.messages, currentUserMessage]);

  // Auto-scroll
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
      {/* Messages area */}
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[800px] px-5 py-6">
          {timeline.length === 0 && !props.active && (
            <div className="flex h-full items-center justify-center">
              <div className="text-center">
                <div className="mb-3 text-3xl">🤖</div>
                <p className="text-sm text-muted-foreground">Send a message to get started</p>
              </div>
            </div>
          )}

          <TimelineRenderer timeline={timeline} />

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
