import { useCallback, useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";

import { apiPatch } from "../api/http";
import ChatThread from "../components/ChatThread";
import type { RootContext } from "./types";

export default function ChatPage() {
  const { sessions, config, socket, activeKey, toggleRight, isRightCollapsed, defaultWorkspace } = useOutletContext<RootContext>();

  const [workspace, setWorkspace] = useState(defaultWorkspace);
  const [workspacePatched, setWorkspacePatched] = useState(false);

  // Initialize workspace from active session metadata
  useEffect(() => {
    const metaWorkspace = sessions.activeSession?.metadata?.workspace;
    if (typeof metaWorkspace === "string" && metaWorkspace) {
      setWorkspace(metaWorkspace);
    } else {
      setWorkspace(defaultWorkspace);
    }
    setWorkspacePatched(false);
  }, [activeKey, sessions.activeSession?.metadata?.workspace, defaultWorkspace]);

  const handleWorkspaceChange = useCallback(
    (path: string) => {
      if (path.trim()) {
        setWorkspace(path.trim());
      }
    },
    []
  );

  const handleSend = useCallback(
    async (text: string): Promise<boolean> => {
      // On first message, persist workspace to session BEFORE sending so the
      // AgentLoop sees the workspace in session metadata.
      const isNew = !sessions.activeSession?.messages?.length;
      if (isNew && !workspacePatched && workspace !== defaultWorkspace) {
        setWorkspacePatched(true);
        await apiPatch(`/api/sessions/${encodeURIComponent(activeKey)}`, {
          workspace,
        }).catch(() => {
          // Silently ignore persistence failures
        });
      }
      return socket.send(text);
    },
    [activeKey, sessions.activeSession?.messages?.length, socket, workspace, workspacePatched, defaultWorkspace]
  );

  return (
    <ChatThread
      sessionKey={activeKey}
      messages={sessions.activeSession?.messages ?? []}
      segments={socket.segments}
      approval={socket.approval}
      connected={socket.connected}
      active={socket.active}
      aborting={socket.aborting}
      error={socket.error ?? sessions.error}
      onSend={handleSend}
      onApprove={socket.resolveApproval}
      onAbort={socket.abort}
      onToggleRight={toggleRight}
      isRightCollapsed={isRightCollapsed}
      models={config.config?.provider?.model ? [config.config.provider.model] : undefined}
      currentModel={config.config?.provider?.model}
      workspacePath={workspace}
      onWorkspaceChange={handleWorkspaceChange}
    />
  );
}
