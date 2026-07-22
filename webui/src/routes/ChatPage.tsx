import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";

import ChatThread from "../components/ChatThread";
import type { ModelConfig } from "../components/Composer";
import type { RootContext } from "./types";

export default function ChatPage() {
  const { sessions, config, socket, activeKey, toggleRight, isRightCollapsed, defaultWorkspace, lastChatKey } = useOutletContext<RootContext>();
  const navigate = useNavigate();

  const [workspace, setWorkspace] = useState(defaultWorkspace);
  const workspacePatchRef = useRef<Promise<boolean> | undefined>(undefined);

  // Derive model config from config
  const agents = config.config?.agents ?? {};
  const providers = config.config?.providers ?? {};
  const defaultAgent = agents["default"];

  const [modelConfig, setModelConfig] = useState<ModelConfig>({
    agentKey: "default",
    provider: defaultAgent?.provider ?? "",
    model: defaultAgent?.model ?? "",
    thinking: defaultAgent?.thinking?.enabled ?? false,
    effort: defaultAgent?.effort ?? 1
  });

  // Sync model config when config loads/changes
  useEffect(() => {
    if (defaultAgent) {
      setModelConfig({
        agentKey: "default",
        provider: defaultAgent.provider,
        model: defaultAgent.model,
        thinking: defaultAgent.thinking.enabled,
        effort: defaultAgent.effort
      });
    }
  }, [defaultAgent?.provider, defaultAgent?.model, defaultAgent?.thinking?.enabled, defaultAgent?.effort]);

  // Initialize workspace from active session metadata
  useEffect(() => {
    const metaWorkspace = sessions.activeSession?.metadata?.workspace;
    if (typeof metaWorkspace === "string" && metaWorkspace) {
      setWorkspace(metaWorkspace);
    } else {
      setWorkspace(defaultWorkspace);
    }
    workspacePatchRef.current = undefined;
  }, [activeKey, sessions.activeSession?.metadata?.workspace, defaultWorkspace]);

  const handleWorkspaceChange = useCallback((nextPath: string) => {
    const normalized = nextPath.trim();
    if (!normalized || normalized === workspace) return;
    setWorkspace(normalized);
    workspacePatchRef.current = sessions.patchSession(activeKey, { workspace: normalized })
      .then(() => true)
      .catch(() => {
        setWorkspace(sessions.activeSession?.effectiveWorkspace ?? defaultWorkspace);
        return false;
      });
  }, [activeKey, defaultWorkspace, sessions.activeSession?.effectiveWorkspace, sessions.patchSession, workspace]);

  const handleSend = useCallback(
    async (text: string): Promise<boolean> => {
      if (workspacePatchRef.current && !await workspacePatchRef.current) return false;
      return socket.send(text);
    },
    [socket]
  );

  const handleOpenSettings = useCallback(() => {
    navigate(`/settings/${encodeURIComponent(activeKey)}`, {
      state: { from: location.pathname }
    });
  }, [navigate, activeKey]);

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
      workspacePath={workspace}
      onWorkspaceChange={handleWorkspaceChange}
      agents={agents}
      providers={providers}
      currentConfig={modelConfig}
      onConfigChange={setModelConfig}
      onOpenSettings={handleOpenSettings}
    />
  );
}
