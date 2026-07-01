import { useCallback, useEffect, useRef } from "react";
import { Outlet, useLocation, useNavigate, useParams } from "react-router-dom";

import AppShell from "../components/AppShell";
import FilesSidebar from "../components/FilesSidebar";
import SessionSidebar from "../components/SessionSidebar";
import { useAgentSocket } from "../hooks/useAgentSocket";
import { useConfig } from "../hooks/useConfig";
import { useFiles } from "../hooks/useFiles";
import { usePanelLayout } from "../hooks/usePanelLayout";
import { useSessions } from "../hooks/useSessions";

export default function RootLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { sessionId } = useParams();

  const activeKey = sessionId ?? "default";
  const sessions = useSessions("default");
  const config = useConfig();
  const files = useFiles();
  const {
    leftCollapsed,
    rightCollapsed,
    leftWidth,
    rightWidth,
    setLeftWidth,
    setRightWidth,
    toggleLeft,
    toggleRight
  } = usePanelLayout();

  // Track the last chat session so SettingsPage can navigate back correctly.
  const lastChatKeyRef = useRef(activeKey);
  if (sessionId) {
    lastChatKeyRef.current = activeKey;
  }

  const refreshActiveSession = useCallback(() => {
    void sessions.loadSession(activeKey);
    void sessions.refresh();
  }, [activeKey, sessions.loadSession, sessions.refresh]);

  // Sync URL param → sessions hook.
  const prevKeyRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (sessionId && sessionId !== prevKeyRef.current) {
      prevKeyRef.current = sessionId;
      void sessions.loadSession(sessionId);
    }
  }, [sessionId, sessions.loadSession]);

  // Use route path rather than Boolean(sessionId) so new non-chat routes
  // don't accidentally inherit chat layout.
  const isChatPage = location.pathname.startsWith("/chat");
  const socket = useAgentSocket(activeKey, { onDone: refreshActiveSession, enabled: isChatPage });

  // Sync activeKey → URL (handles "default" session, new sessions, and
  // session changes from sidebar)
  const handleSessionSelect = useCallback(
    (key: string) => {
      navigate(`/chat/${encodeURIComponent(key)}`);
    },
    [navigate]
  );

  const handleNewSession = useCallback(() => {
    handleSessionSelect(`session-${crypto.randomUUID()}`);
  }, [handleSessionSelect]);

  return (
    <AppShell
      workspacePath={config.config?.workspace}
      sessionSidebar={
        <SessionSidebar
          sessions={sessions.sessions}
          activeKey={activeKey}
          onSelect={handleSessionSelect}
          onNew={handleNewSession}
          onToggleCollapse={toggleLeft}
        />
      }
      filesSidebar={
        isChatPage ? (
          <FilesSidebar
            tree={files.tree}
            selectedPath={files.selected?.path}
            selectedContent={files.selected?.content}
            workspacePath={config.config?.workspace}
            error={files.error}
            onSelect={files.selectFile}
            onRefresh={files.refreshTree}
            onToggleCollapse={toggleRight}
          />
        ) : null
      }
      leftCollapsed={leftCollapsed}
      rightCollapsed={rightCollapsed || !isChatPage}
      leftWidth={leftWidth}
      rightWidth={rightWidth}
      onToggleLeft={toggleLeft}
      onToggleRight={toggleRight}
      onLeftWidthChange={setLeftWidth}
      onRightWidthChange={setRightWidth}
    >
      <Outlet
        context={{
          sessions,
          config,
          files,
          socket,
          activeKey,
          lastChatKey: lastChatKeyRef.current
        }}
      />
    </AppShell>
  );
}
