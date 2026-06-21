import { useCallback, useEffect, useRef, useState } from "react";

import { apiDelete, apiGet } from "../api/http";
import type { Session, SessionSummary } from "../api/types";

function formatError(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

export function useSessions(defaultKey = "default") {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [activeKey, setActiveKey] = useState(defaultKey);
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
    try {
      const nextSession = await apiGet<Session>(`/api/sessions/${encodeURIComponent(key)}`);
      if (mountedRef.current && requestId === sessionRequestRef.current) {
        setActiveSession(nextSession);
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
    void loadSession(defaultKey);
  }, [defaultKey, loadSession, refresh]);

  return { sessions, activeKey, activeSession, error, refresh, loadSession, deleteSession };
}
