import { useCallback, useEffect, useRef, useState } from "react";

import { apiGet, apiPut } from "../api/http";
import type { Config, ToolDefinition } from "../api/types";

function formatError(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

export function useConfig() {
  const [config, setConfig] = useState<Config | undefined>();
  const [tools, setTools] = useState<ToolDefinition[]>([]);
  const [error, setError] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);
  const mountedRef = useRef(true);
  const refreshRequestRef = useRef(0);
  const saveRequestRef = useRef(0);

  const refresh = useCallback(async () => {
    const requestId = ++refreshRequestRef.current;
    try {
      const [nextConfig, nextTools] = await Promise.all([
        apiGet<Config>("/api/config"),
        apiGet<ToolDefinition[]>("/api/tools")
      ]);
      if (mountedRef.current && requestId === refreshRequestRef.current) {
        setConfig(nextConfig);
        setTools(nextTools);
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

  const save = useCallback(async (patch: Partial<Config>) => {
    const requestId = ++saveRequestRef.current;
    setSaving(true);
    try {
      const nextConfig = await apiPut<Config>("/api/config", patch);
      if (mountedRef.current && requestId === saveRequestRef.current) {
        setConfig(nextConfig);
        setError(undefined);
      }
      return true;
    } catch (cause) {
      if (mountedRef.current && requestId === saveRequestRef.current) {
        setError(formatError(cause));
      }
      return false;
    } finally {
      if (mountedRef.current && requestId === saveRequestRef.current) {
        setSaving(false);
      }
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { config, tools, error, saving, refresh, save };
}
