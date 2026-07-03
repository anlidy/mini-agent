import { useEffect, useMemo, useRef, useState } from "react";
import { Moon, PanelRightClose, PanelRightOpen } from "lucide-react";

import type { MessageRecord } from "../api/types";
import type { ApprovalRequest, StreamSegment } from "../hooks/useAgentSocket";
import { buildTimeline, extractToolSteps, renderContent } from "../lib/timeline";
import ApprovalCard from "./ApprovalCard";
import { Button } from "./ui/button";
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
  onToggleRight?(): void;
  isRightCollapsed?: boolean;
  models?: string[];
  currentModel?: string;
  onModelChange?(model: string): void;
  workspacePath?: string;
  onWorkspaceChange?(path: string): void;
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
  const showStartScreen = timeline.length === 0 && !props.active && !props.error;

  const composerEl = (
    <Composer
      disabled={props.active || !props.connected}
      value={draft}
      onChange={setDraft}
      active={props.active}
      aborting={props.aborting}
      onAbort={props.onAbort}
      models={props.models}
      currentModel={props.currentModel}
      onModelChange={props.onModelChange}
      workspacePath={props.workspacePath}
      onWorkspaceChange={props.onWorkspaceChange}
      onSend={(text) => {
        const accepted = props.onSend(text);
        if (accepted) {
          setDraft("");
          setCurrentUserMessage(text);
          wasActiveRef.current = true;
        }
      }}
    />
  );

  return (
    <div className="flex h-full min-w-0 flex-col bg-background">
      {/* Top bar — minimal, right-aligned, no border */}
      <div className="flex h-12 shrink-0 items-center justify-end px-4">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Appearance"
          type="button"
          title="Appearance"
          className="mr-0.5 text-ink-muted hover:text-ink"
        >
          <Moon size={17} />
        </Button>
        {props.onToggleRight && (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={props.isRightCollapsed ? "Open files panel" : "Close files panel"}
            onClick={props.onToggleRight}
            type="button"
            title={props.isRightCollapsed ? "Open files panel" : "Close files panel"}
            className="text-ink-muted hover:text-ink"
          >
            {props.isRightCollapsed ? <PanelRightOpen size={15} /> : <PanelRightClose size={15} />}
          </Button>
        )}
      </div>

      {showStartScreen ? (
        /* ── Empty state ── */
        <div className="flex min-h-0 flex-1 items-center justify-center px-8 pb-[16vh] pt-2">
          <div className="w-full max-w-[600px]">
            <h1 className="mb-8 text-center text-[28px] font-medium leading-tight tracking-tight text-ink md:text-[34px] text-balance">
              今天从哪里开始?
            </h1>
            {composerEl}
          </div>
        </div>
      ) : (
        <>
          {/* ── Messages area ── */}
          <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
            <div className="mx-auto max-w-[760px] px-5 pb-10 pt-6">
              <TimelineRenderer timeline={timeline} />

              {props.error ? (
                <div className="mt-4 rounded-xl bg-red-soft px-4 py-3 text-[13px] leading-relaxed text-red">
                  {props.error}
                </div>
              ) : null}
            </div>
          </div>

          <ApprovalCard approval={props.approval} onResolve={props.onApprove} />

          {/* ── Composer ── */}
          <div className="mx-auto w-full max-w-[760px]">
            {composerEl}
          </div>
        </>
      )}
    </div>
  );
}
