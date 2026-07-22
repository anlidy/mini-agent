import { useCallback, useEffect, useRef, useState } from "react";

import { apiGet } from "../api/http";
import type { FileContent, FileTreeNode } from "../api/types";

function formatError(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

export function useFiles(sessionKey = "default", sessionRevision?: number) {
  const [tree, setTree] = useState<FileTreeNode | undefined>();
  const [selected, setSelected] = useState<FileContent | undefined>();
  const [error, setError] = useState<string | undefined>();
  const mountedRef = useRef(true);
  const treeRequestRef = useRef(0);
  const fileRequestRef = useRef(0);
  const treeAbortRef = useRef<AbortController | undefined>(undefined);
  const fileAbortRef = useRef<AbortController | undefined>(undefined);

  const refreshTree = useCallback(async () => {
    const requestId = ++treeRequestRef.current;
    treeAbortRef.current?.abort();
    const controller = new AbortController();
    treeAbortRef.current = controller;
    try {
      const nextTree = await apiGet<FileTreeNode>(`/api/sessions/${encodeURIComponent(sessionKey)}/files/tree?path=.`, { signal: controller.signal });
      if (mountedRef.current && requestId === treeRequestRef.current) {
        setTree(nextTree);
        setError(undefined);
      }
    } catch (cause) {
      if (controller.signal.aborted) return;
      if (mountedRef.current && requestId === treeRequestRef.current) {
        setError(formatError(cause));
      }
    }
  }, [sessionKey, sessionRevision]);

  const selectFile = useCallback(async (path: string) => {
    const requestId = ++fileRequestRef.current;
    fileAbortRef.current?.abort();
    const controller = new AbortController();
    fileAbortRef.current = controller;
    try {
      const nextSelected = await apiGet<FileContent>(`/api/sessions/${encodeURIComponent(sessionKey)}/files/content?path=${encodeURIComponent(path)}`, { signal: controller.signal });
      if (mountedRef.current && requestId === fileRequestRef.current) {
        setSelected(nextSelected);
        setError(undefined);
      }
    } catch (cause) {
      if (controller.signal.aborted) return;
      if (mountedRef.current && requestId === fileRequestRef.current) {
        setError(formatError(cause));
      }
    }
  }, [sessionKey, sessionRevision]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      treeAbortRef.current?.abort();
      fileAbortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    fileRequestRef.current += 1;
    fileAbortRef.current?.abort();
    setTree(undefined);
    setSelected(undefined);
    void refreshTree();
    return () => {
      treeAbortRef.current?.abort();
      fileAbortRef.current?.abort();
    };
  }, [refreshTree]);

  return { tree, selected, error, refreshTree, selectFile };
}
