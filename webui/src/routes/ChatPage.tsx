import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";

import { apiPatch } from "../api/http";
import ChatThread from "../components/ChatThread";
import type { ModelConfig } from "../components/Composer";
import type { RootContext } from "./types";

export default function ChatPage() {
  const { sessions, config, socket, activeKey, toggleRight, isRightCollapsed, defaultWorkspace, lastChatKey } = useOutletContext<RootContext>();
  const navigate = useNavigate();

  const [workspace, setWorkspace] = useState(defaultWorkspace);
  const [workspacePatched, setWorkspacePatched] = useState(false);

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
