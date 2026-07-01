import { useCallback, useEffect, useRef, useState } from "react";

import { apiDelete, apiGet } from "../api/http";
import type { Session, SessionSummary } from "../api/types";

const ACTIVE_SESSION_STORAGE_KEY = "mini-agent.activeSessionKey";

function formatError(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

function readStoredActiveKey(defaultKey: string): string {
  try {
    return localStorage.getItem(ACTIVE_SESSION_STORAGE_KEY) || defaultKey;
  } catch {
    return defaultKey;
  }
}

function writeStoredActiveKey(key: string): void {
  try {
    localStorage.setItem(ACTIVE_SESSION_STORAGE_KEY, key);
  } catch {
    // Ignore storage failures; session loading should still work.
  }
}

export function useSessions(defaultKey = "default") {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [activeKey, setActiveKey] = useState(() => readStoredActiveKey(defaultKey));
  const [activeSession, setActiveSession] = useState<Session | undefined>();
  const [error, setError] = useState<string | undefined>();
  const mountedRef = useRef(true);
  const refreshRequestRef = useRef(0);
  const sessionRequestRef = useRef(0);

  const refresh = useCallback(async () => {
    const requestId = ++refreshRequestRef.current;
    try {
      const nextSessions = await apiGet<SessionSummary[]>("/api/sessions");
      if (mountedRef.current && requestId === refreshRequestRef.current) {
        setSessions(nextSessions);
        setError(undefined);
      }
      return true;
    } catch (cause) {
      if (mountedRef.current && requestId === refreshRequestRef.current) {
        setError(formatError(cause));
      }
      return false;
    }
  }, []);

  const loadSession = useCallback(async (key: string) => {
    const requestId = ++sessionRequestRef.current;
    setActiveKey(key);
    // Only clear when switching to a *different* session.  Same-key
    // refreshes keep the old data visible while the fetch is in-flight,
    // avoiding a flash of empty state that can cause message duplication
    // when combined with live segments clearing.
    setActiveSession((prev) => (prev?.key === key ? prev : undefined));
    try {
      const nextSession = await apiGet<Session>(`/api/sessions/${encodeURIComponent(key)}`);
      if (mountedRef.current && requestId === sessionRequestRef.current) {
        setActiveSession(nextSession);
        writeStoredActiveKey(key);
        setError(undefined);
      }
      return true;
    } catch (cause) {
      if (mountedRef.current && requestId === sessionRequestRef.current) {
        setError(formatError(cause));
      }
      return false;
    }
  }, []);

  const deleteSession = useCallback(async (key: string) => {
    try {
      await apiDelete(`/api/sessions/${encodeURIComponent(key)}`);
      const refreshed = await refresh();
      let loaded = true;
      if (key === activeKey) {
        loaded = await loadSession(defaultKey);
      }
      if (!refreshed || !loaded) {
        throw new Error("Session deleted, but refreshing sessions failed");
      }
      if (mountedRef.current) {
        setError(undefined);
      }
    } catch (cause) {
      if (mountedRef.current) {
        setError(formatError(cause));
      }
      throw cause;
    }
  }, [activeKey, defaultKey, loadSession, refresh]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { sessions, activeKey, activeSession, error, refresh, loadSession, deleteSession };
}
