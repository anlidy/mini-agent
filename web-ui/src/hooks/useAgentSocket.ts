import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { createAgentSocket, type AgentSocket, type ServerMessage } from "../api/ws";

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

interface UseAgentSocketOptions {
  onDone?(): void;
}

export function useAgentSocket(sessionKey: string, options: UseAgentSocketOptions = {}) {
  const { onDone } = options;
  const socketRef = useRef<AgentSocket | undefined>(undefined);
  const approvalRef = useRef<ApprovalRequest | undefined>(undefined);
  const turnActiveRef = useRef(false);
  const [assistantDraft, setAssistantDraft] = useState("");
  const [steps, setSteps] = useState<ExecutionStep[]>([]);
  const [approval, setApprovalState] = useState<ApprovalRequest | undefined>();
  const [connected, setConnected] = useState(false);
  const [active, setActive] = useState(false);
  const [aborting, setAborting] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const setApproval = useCallback((next: ApprovalRequest | undefined) => {
    approvalRef.current = next;
    setApprovalState(next);
  }, []);

  const updateStep = useCallback((id: string, patch: Partial<ExecutionStep>) => {
    setSteps((current) => current.map((step) => (step.id === id ? { ...step, ...patch } : step)));
  }, []);

  const handleMessage = useCallback(
    (message: ServerMessage) => {
      if (message.type === "token") {
        setAssistantDraft((current) => current + message.text);
        return;
      }

      if (message.type === "tool_call") {
        setSteps((current) => [
          ...current,
          {
            id: message.id,
            kind: "tool",
            title: message.name,
            status: "pending",
            detail: JSON.stringify(message.arguments, null, 2)
          }
        ]);
        return;
      }

      if (message.type === "tool_result") {
        setSteps((current) =>
          current.map((step) =>
            step.id === message.id ? { ...step, status: message.status, detail: message.content } : step
          )
        );
        return;
      }

      if (message.type === "approve_request") {
        const nextApproval = { id: message.id, command: message.command };
        setApproval(nextApproval);
        setSteps((current) => [
          ...current,
          {
            id: message.id,
            kind: "tool",
            title: `exec ${message.command}`,
            status: "approval"
          }
        ]);
        return;
      }

      if (message.type === "done") {
        turnActiveRef.current = false;
        setActive(false);
        setAborting(false);
        if (typeof message.result.finalContent === "string") {
          setAssistantDraft(message.result.finalContent);
        }
        onDone?.();
        if (approvalRef.current && !approvalRef.current.resolved) {
          const expiredApproval = { ...approvalRef.current, resolved: "expired" as const };
          setApproval(expiredApproval);
          updateStep(expiredApproval.id, { status: "error", detail: "approval expired" });
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
    },
    [onDone, setApproval, updateStep]
  );

  const send = useCallback((text: string): boolean => {
    if (turnActiveRef.current) {
      setError("A turn is already active.");
      return false;
    }

    if (!connected || !socketRef.current) {
      setError("WebSocket is not connected.");
      return false;
    }

    setAssistantDraft("");
    setSteps([]);
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
  }, [connected, setApproval]);

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
    updateStep(currentApproval.id, { status: "done", detail: resolved });
  }, [setApproval, updateStep]);

  useEffect(() => {
    socketRef.current?.close();
    setAssistantDraft("");
    setSteps([]);
    setApproval(undefined);
    setConnected(false);
    turnActiveRef.current = false;
    setActive(false);
    setAborting(false);
    setError(undefined);

    const socket = createAgentSocket(sessionKey, {
      onOpen() {
        setConnected(true);
      },
      onMessage: handleMessage,
      onClose() {
        setConnected(false);
        turnActiveRef.current = false;
        setActive(false);
        setAborting(false);
        if (approvalRef.current && !approvalRef.current.resolved) {
          const expiredApproval = { ...approvalRef.current, resolved: "expired" as const };
          setApproval(expiredApproval);
          updateStep(expiredApproval.id, { status: "error", detail: "approval expired" });
        }
      },
      onError() {
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
  }, [handleMessage, sessionKey, setApproval, updateStep]);

  return useMemo(
    () => ({
      assistantDraft,
      steps,
      approval,
      connected,
      active,
      aborting,
      error,
      send,
      abort,
      resolveApproval
    }),
    [abort, aborting, active, approval, assistantDraft, connected, error, resolveApproval, send, steps]
  );
}
