import { useCallback } from "react";
import { useOutletContext } from "react-router-dom";

import ChatThread from "../components/ChatThread";
import type { RootContext } from "./types";

export default function ChatPage() {
  const { sessions, config, socket, activeKey, toggleRight, isRightCollapsed } = useOutletContext<RootContext>();

  const handleWorkspaceChange = useCallback(
    (path: string) => {
      if (path.trim()) {
        config.save({ workspace: path.trim() });
      }
    },
    [config]
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
      onSend={socket.send}
      onApprove={socket.resolveApproval}
      onAbort={socket.abort}
      onToggleRight={toggleRight}
      isRightCollapsed={isRightCollapsed}
      models={config.config?.provider?.model ? [config.config.provider.model] : undefined}
      currentModel={config.config?.provider?.model}
      workspacePath={config.config?.workspace}
      onWorkspaceChange={handleWorkspaceChange}
    />
  );
}
