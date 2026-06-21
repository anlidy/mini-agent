import { useEffect, useRef, useState } from "react";

import type { MessageRecord } from "../api/types";
import type { ApprovalRequest, ExecutionStep } from "../hooks/useAgentSocket";
import ApprovalCard from "./ApprovalCard";
import Composer from "./Composer";
import ExecutionChain from "./ExecutionChain";

interface ChatThreadProps {
  sessionKey: string;
  messages: MessageRecord[];
  assistantDraft: string;
  steps: ExecutionStep[];
  approval?: ApprovalRequest;
  connected: boolean;
  active: boolean;
  aborting: boolean;
  error?: string;
  onSend(text: string): boolean;
  onApprove(approved: boolean): void;
  onAbort(): void;
}

function renderMessageContent(content: unknown) {
  if (typeof content === "string") {
    return content;
  }

  return JSON.stringify(content, null, 2);
}

export default function ChatThread(props: ChatThreadProps) {
  const [draft, setDraft] = useState("");
  const wasActiveRef = useRef(false);

  useEffect(() => {
    if (wasActiveRef.current && !props.active && !props.error) {
      setDraft("");
    }
    wasActiveRef.current = props.active;
  }, [props.active, props.error]);

  return (
    <div className="mx-auto grid min-h-[746px] w-full max-w-[700px] grid-rows-[48px_minmax(0,1fr)_auto] px-5">
      <div className="flex items-center justify-between border-b border-line">
        <strong className="text-sm text-ink">{props.sessionKey}</strong>
        {props.active ? (
          <button
            className="rounded-[7px] border border-line bg-white px-2.5 py-1 font-mono text-[11px] text-muted"
            disabled={props.aborting}
            onClick={props.onAbort}
            type="button"
          >
            {props.aborting ? "Aborting" : "Abort"}
          </button>
        ) : (
          <span className="font-mono text-[11px] text-muted">mini-agent</span>
        )}
      </div>
      <div className="overflow-y-auto py-7">
        {props.messages.map((message, index) => {
          const isUser = message.role === "user";

          return (
            <article key={`${message.timestamp}-${index}`} className={`mb-5 ${isUser ? "ml-auto max-w-[620px]" : ""}`}>
              <div className="mb-1.5 font-mono text-[11px] uppercase text-[#9aa2aa]">
                {isUser ? "You" : "mini-agent"}
              </div>
              <div
                className={`whitespace-pre-wrap rounded-ui p-4 text-sm leading-relaxed ${
                  isUser ? "bg-accent-soft" : "bg-white shadow-[inset_0_0_0_1px_#e1e5e2]"
                }`}
              >
                {renderMessageContent(message.content)}
              </div>
            </article>
          );
        })}
        {props.assistantDraft ? (
          <article className="mb-5">
            <div className="mb-1.5 font-mono text-[11px] uppercase text-[#9aa2aa]">mini-agent</div>
            <div className="whitespace-pre-wrap rounded-ui bg-white p-4 text-sm leading-relaxed shadow-[inset_0_0_0_1px_#e1e5e2]">
              {props.assistantDraft}
            </div>
          </article>
        ) : null}
        <ExecutionChain steps={props.steps} />
        <ApprovalCard approval={props.approval} onResolve={props.onApprove} />
        {props.error ? <div className="rounded-ui bg-red/10 p-3 text-sm text-red">{props.error}</div> : null}
      </div>
      <Composer
        disabled={props.active || !props.connected}
        value={draft}
        onChange={setDraft}
        onSend={(text) => {
          const accepted = props.onSend(text);
          if (accepted) {
            wasActiveRef.current = true;
          }
        }}
      />
    </div>
  );
}
