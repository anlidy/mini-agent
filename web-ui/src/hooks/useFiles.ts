import { useCallback, useEffect, useRef, useState } from "react";

import { apiGet } from "../api/http";
import type { FileContent, FileTreeNode } from "../api/types";

function formatError(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

export function useFiles() {
  const [tree, setTree] = useState<FileTreeNode | undefined>();
  const [selected, setSelected] = useState<FileContent | undefined>();
  const [error, setError] = useState<string | undefined>();
  const mountedRef = useRef(true);
  const treeRequestRef = useRef(0);
  const fileRequestRef = useRef(0);

  const refreshTree = useCallback(async () => {
    const requestId = ++treeRequestRef.current;
    try {
      const nextTree = await apiGet<FileTreeNode>("/api/files/tree?path=.");
      if (mountedRef.current && requestId === treeRequestRef.current) {
        setTree(nextTree);
        setError(undefined);
      }
    } catch (cause) {
      if (mountedRef.current && requestId === treeRequestRef.current) {
        setError(formatError(cause));
      }
    }
  }, []);

  const selectFile = useCallback(async (path: string) => {
    const requestId = ++fileRequestRef.current;
    try {
      const nextSelected = await apiGet<FileContent>(`/api/files/content?path=${encodeURIComponent(path)}`);
      if (mountedRef.current && requestId === fileRequestRef.current) {
        setSelected(nextSelected);
        setError(undefined);
      }
    } catch (cause) {
      if (mountedRef.current && requestId === fileRequestRef.current) {
        setError(formatError(cause));
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
    void refreshTree();
  }, [refreshTree]);

  return { tree, selected, error, refreshTree, selectFile };
}
