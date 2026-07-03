import { useCallback, useEffect, useRef, useState } from "react";

import { apiDelete, apiGet, apiPatch } from "../api/http";
import type { Session, SessionSummary } from "../api/types";

const ACTIVE_SESSION_STORAGE_KEY = "mini-agent.activeSessionKey";
const DISPLAY_NAMES_STORAGE_KEY = "mini-agent.displayNames";

function readDisplayNames(): Record<string, string> {
  try {
    const raw = localStorage.getItem(DISPLAY_NAMES_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (typeof parsed !== "object" || Array.isArray(parsed) || !parsed) return {};
    return parsed as Record<string, string>;
  } catch {
    return {};
  }
}

function writeDisplayNames(names: Record<string, string>): void {
  try {
    localStorage.setItem(DISPLAY_NAMES_STORAGE_KEY, JSON.stringify(names));
  } catch {
    // Ignore storage failures
  }
}

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
  const [displayNames, setDisplayNames] = useState<Record<string, string>>(readDisplayNames);
  const mountedRef = useRef(true);
  const refreshRequestRef = useRef(0);
  const sessionRequestRef = useRef(0);

  const getDisplayName = useCallback(
    (key: string): string => displayNames[key] || key,
    [displayNames]
  );

  const patchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setDisplayName = useCallback((key: string, name: string): void => {
    const next = { ...readDisplayNames() };
    if (name.trim()) {
      next[key] = name.trim();
    } else {
      delete next[key];
    }
    writeDisplayNames(next);
    setDisplayNames(next);
    // Debounce backend persistence to avoid wasted PATCH requests during rapid typing
    if (patchTimerRef.current) {
      clearTimeout(patchTimerRef.current);
    }
    patchTimerRef.current = setTimeout(() => {
      apiPatch(`/api/sessions/${encodeURIComponent(key)}`, { title: name.trim() }).catch(() => {
        // Silently ignore backend persistence failures
      });
    }, 500);
  }, []);

  const refresh = useCallback(async () => {
    const requestId = ++refreshRequestRef.current;
    try {
      const nextSessions = await apiGet<SessionSummary[]>("/api/sessions");
      if (mountedRef.current && requestId === refreshRequestRef.current) {
        setSessions(nextSessions);
        setError(undefined);
        // Hydrate displayNames from backend titles for keys not already set locally
        const existing = readDisplayNames();
        let changed = false;
        for (const s of nextSessions) {
          if (s.title && !(s.key in existing)) {
            existing[s.key] = s.title;
            changed = true;
          }
        }
        if (changed) {
          writeDisplayNames(existing);
          setDisplayNames({ ...existing });
        }
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

  return { sessions, activeKey, activeSession, error, refresh, loadSession, deleteSession, getDisplayName, setDisplayName };
}
