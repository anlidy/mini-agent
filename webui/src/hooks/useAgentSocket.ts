import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { createAgentSocket, type AgentSocket, type ServerMessage } from "../api/ws";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface ExecutionStep {
  id: string;
  kind: "thinking" | "tool";
  title: string;
  status: "pending" | "ok" | "error" | "approval" | "done";
  detail?: string;
}

export interface ApprovalRequest {
  id: string;
  command: string;
  resolved?: "approved" | "denied" | "expired";
}

/** Ordered streaming segment — preserves the sequence of tokens and tool calls. */
export type StreamSegment =
  | { kind: "text"; id: string; content: string }
  | { kind: "tool"; step: ExecutionStep };

/* ------------------------------------------------------------------ */
/*  Hook                                                               */
/* ------------------------------------------------------------------ */

interface UseAgentSocketOptions {
  onDone?(): void;
}

export function useAgentSocket(sessionKey: string, options: UseAgentSocketOptions = {}) {
  const onDoneRef = useRef(options.onDone);
  onDoneRef.current = options.onDone;

  const socketRef = useRef<AgentSocket | undefined>(undefined);
  const approvalRef = useRef<ApprovalRequest | undefined>(undefined);
  const turnActiveRef = useRef(false);
  const generationRef = useRef(0);
  const nextTextIdRef = useRef(0);
  const [segments, setSegments] = useState<StreamSegment[]>([]);
  const [approval, setApprovalState] = useState<ApprovalRequest | undefined>();
  const [connected, setConnected] = useState(false);
  const [active, setActive] = useState(false);
  const [aborting, setAborting] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const setApproval = useCallback((next: ApprovalRequest | undefined) => {
    approvalRef.current = next;
    setApprovalState(next);
  }, []);

  /* ---- Helpers to update segments while keeping order -------------- */

  /** Build a fingerprint for a tool step — used to dedup approval vs tool_call. */
  function toolStepKey(step: ExecutionStep): string {
    // Approval steps encode the shell command in the title: "exec <command>"
    if (step.title.startsWith("exec ")) {
      return `exec:${step.title.slice(5)}`;
    }
    if (step.detail) {
      try {
        const parsed = JSON.parse(step.detail) as Record<string, unknown>;
        if (typeof parsed.command === "string") {
          return `exec:${parsed.command}`;
        }
      } catch { /* not JSON */ }
    }
    return `${step.title}:${step.detail ?? ""}`;
  }

  const appendText = useCallback((text: string) => {
    setSegments((current) => {
      const last = current[current.length - 1];
      if (last && last.kind === "text") {
        // Append to the existing text segment so we don't scatter tiny fragments
        const updated: StreamSegment = { ...last, content: last.content + text };
        return [...current.slice(0, -1), updated];
      }
      // Start a fresh text segment after a tool call
      const id = `txt-${generationRef.current}-${++nextTextIdRef.current}`;
      return [...current, { kind: "text", id, content: text }];
    });
  }, []);

  const appendToolStep = useCallback((step: ExecutionStep) => {
    setSegments((current) => {
      // If this tool_call replaces an existing approval step, swap it so
      // the segment ID matches the persisted tool_call ID (dedup works).
      const replaceKey = toolStepKey(step);
      const replaceIdx = current.findIndex(
        (s) => s.kind === "tool" && s.step.id !== step.id && toolStepKey(s.step) === replaceKey
      );
      if (replaceIdx >= 0) {
        const updated = [...current];
        updated[replaceIdx] = { kind: "tool" as const, step };
        return updated;
      }
      return [...current, { kind: "tool", step }];
    });
  }, []);

  const updateToolStep = useCallback((id: string, patch: Partial<ExecutionStep>) => {
    setSegments((current) =>
      current.map((seg) =>
        seg.kind === "tool" && seg.step.id === id
          ? { kind: "tool" as const, step: { ...seg.step, ...patch } }
          : seg
      )
    );
  }, []);

  /* ---- Stable message handler — uses refs to avoid dep churn ------- */

  const handleMessageRef = useRef<(message: ServerMessage) => void>(() => {});
  handleMessageRef.current = (message: ServerMessage) => {
    if (message.type === "token") {
      appendText(message.text);
      return;
    }

    if (message.type === "tool_call") {
      appendToolStep({
        id: message.id,
        kind: "tool",
        title: message.name,
        status: "pending",
        detail: JSON.stringify(message.arguments, null, 2)
      });
      return;
    }

    if (message.type === "tool_result") {
      updateToolStep(message.id, { status: message.status, detail: message.content });
      return;
    }

    if (message.type === "approve_request") {
      const nextApproval = { id: message.id, command: message.command };
      setApproval(nextApproval);
      // Only create a tool step if one doesn't already exist for this command
      // (a tool_call may have arrived first with a different id).
      const key = `exec:${message.command}`;
      setSegments((current) => {
        const exists = current.some(
          (s) => s.kind === "tool" && toolStepKey(s.step) === key
        );
        if (exists) return current;
        return [
          ...current,
          {
            kind: "tool" as const,
            step: {
              id: message.id,
              kind: "tool" as const,
              title: `exec ${message.command}`,
              status: "approval" as const
            }
          }
        ];
      });
      return;
    }

    if (message.type === "done") {
      turnActiveRef.current = false;
      setActive(false);
      setAborting(false);
      onDoneRef.current?.();
      if (approvalRef.current && !approvalRef.current.resolved) {
        const expiredApproval = { ...approvalRef.current, resolved: "expired" as const };
        setApproval(expiredApproval);
        updateToolStep(expiredApproval.id, { status: "error", detail: "approval expired" });
      }
      return;
    }

    if (message.type === "error") {
      turnActiveRef.current = false;
      setActive(false);
      setAborting(false);
      setError(message.error);
      return;
    }

    if (message.type === "turn_rejected") {
      setError(message.reason);
    }
  };

  const send = useCallback((text: string): boolean => {
    if (turnActiveRef.current) {
      setError("A turn is already active.");
      return false;
    }

    if (!connected || !socketRef.current) {
      setError("WebSocket is not connected.");
      return false;
    }

    setSegments([]);
    nextTextIdRef.current = 0;
    setApproval(undefined);
    setError(undefined);
    turnActiveRef.current = true;
    setActive(true);
    setAborting(false);
    try {
      socketRef.current.send({ type: "user_message", text });
      return true;
    } catch (cause) {
      turnActiveRef.current = false;
      setActive(false);
      setError(cause instanceof Error ? cause.message : String(cause));
      return false;
    }
  }, [connected]);

  const abort = useCallback(() => {
    if (!active || aborting) {
      return;
    }
    try {
      socketRef.current?.send({ type: "abort" });
      setAborting(true);
    } catch (cause) {
      setActive(false);
      setAborting(false);
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }, [aborting, active]);

  const resolveApproval = useCallback((approved: boolean) => {
    const currentApproval = approvalRef.current;
    if (!currentApproval) {
      return;
    }

    socketRef.current?.send({
      type: "approve_command",
      id: currentApproval.id,
      approved
    });
    const resolved = approved ? "approved" : "denied";
    setApproval({ ...currentApproval, resolved });

    // Update the matching tool step.  The approval step may have been
    // replaced by a tool_call with a different id — fall back to matching
    // by the exec command fingerprint.
    setSegments((current) =>
      current.map((seg) => {
        if (seg.kind !== "tool") return seg;
        if (seg.step.id === currentApproval.id) {
          return { ...seg, step: { ...seg.step, status: "done", detail: resolved } };
        }
        // Fallback: tool_call replaced the approval step — match by command
        if (seg.step.status === "pending" && seg.step.title === "exec") {
          try {
            const args = JSON.parse(seg.step.detail ?? "{}") as Record<string, unknown>;
            if (typeof args.command === "string" && args.command === currentApproval.command) {
              return { ...seg, step: { ...seg.step, status: "done", detail: resolved } };
            }
          } catch { /* ignore */ }
        }
        return seg;
      })
    );
  }, []);

  // Connect/reconnect only when sessionKey changes
  useEffect(() => {
    socketRef.current?.close();
    const gen = ++generationRef.current;
    nextTextIdRef.current = 0;
    setSegments([]);
    setApproval(undefined);
    setConnected(false);
    turnActiveRef.current = false;
    setActive(false);
    setAborting(false);
    setError(undefined);

    const socket = createAgentSocket(sessionKey, {
      onOpen() {
        if (generationRef.current !== gen) return;
        setConnected(true);
      },
      onMessage(message) {
        if (generationRef.current !== gen) return;
        handleMessageRef.current(message);
      },
      onClose() {
        if (generationRef.current !== gen) return;
        setConnected(false);
        turnActiveRef.current = false;
        setActive(false);
        setAborting(false);
        if (approvalRef.current && !approvalRef.current.resolved) {
          const expiredApproval = { ...approvalRef.current, resolved: "expired" as const };
          setApproval(expiredApproval);
          setSegments((current) =>
            current.map((seg) =>
              seg.kind === "tool" && seg.step.id === expiredApproval.id
                ? { kind: "tool", step: { ...seg.step, status: "error", detail: "approval expired" } }
                : seg
            )
          );
        }
      },
      onError() {
        if (generationRef.current !== gen) return;
        setConnected(false);
        turnActiveRef.current = false;
        setActive(false);
        setAborting(false);
        setError("WebSocket connection failed.");
      }
    });
    socketRef.current = socket;

    return () => {
      if (socketRef.current === socket) {
        socketRef.current = undefined;
      }
      socket.close();
    };
  }, [sessionKey]);

  return useMemo(
    () => ({
      segments,
      approval,
      connected,
      active,
      aborting,
      error,
      send,
      abort,
      resolveApproval
    }),
    [abort, aborting, active, approval, connected, error, resolveApproval, segments, send]
  );
}
