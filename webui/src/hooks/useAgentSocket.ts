import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { createAgentSocket, type AgentSocket, type ServerMessage } from "../api/ws";
import {
  appendText,
  appendToolStep,
  segmentsWithApproval,
  segmentsWithApprovalResolved,
  updateToolStep
} from "../lib/segmentReducer";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface ExecutionStep {
  id: string;
  kind: "thinking" | "tool";
  title: string;
  status: "pending" | "ok" | "error" | "approval" | "done";
  detail?: string;
  detailKind?: "args" | "result";
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
  /** When false, the WebSocket is not opened (e.g. on non-chat routes). */
  enabled?: boolean;
}

export function useAgentSocket(sessionKey: string, options: UseAgentSocketOptions = {}) {
  const { enabled = true } = options;
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

  /* ---- Stable message handler — uses refs to avoid dep churn ------- */

  const handleMessageRef = useRef<(message: ServerMessage) => void>(() => {});
  handleMessageRef.current = (message: ServerMessage) => {
    if (message.type === "token") {
      setSegments((current) =>
        appendText(current, message.text, generationRef.current, ++nextTextIdRef.current)
      );
      return;
    }

    if (message.type === "tool_call") {
      setSegments((current) =>
        appendToolStep(current, {
          id: message.id,
          kind: "tool",
          title: message.name,
          status: "pending",
          detail: JSON.stringify(message.arguments, null, 2),
          detailKind: "args"
        })
      );
      return;
    }

    if (message.type === "tool_result") {
      setSegments((current) =>
        updateToolStep(current, message.id, { status: message.status, detail: message.content, detailKind: "result" })
      );
      return;
    }

    if (message.type === "approve_request") {
      const nextApproval = { id: message.id, command: message.command };
      setApproval(nextApproval);
      setSegments((current) =>
        segmentsWithApproval(current, message.id, message.command)
      );
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
        setSegments((current) =>
          updateToolStep(current, expiredApproval.id, { status: "error", detail: "approval expired" })
        );
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
      turnActiveRef.current = false;
      setActive(false);
      setAborting(false);
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

    setSegments((current) =>
      segmentsWithApprovalResolved(current, currentApproval.id, currentApproval.command, resolved)
    );
  }, []);

  // Connect/reconnect only when sessionKey changes (skip when disabled).
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

    if (!enabled) {
      socketRef.current = undefined;
      return;
    }

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
            updateToolStep(current, expiredApproval.id, { status: "error", detail: "approval expired" })
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
  }, [sessionKey, enabled]);

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
