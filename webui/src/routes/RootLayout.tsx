import { useCallback, useEffect, useMemo, useRef } from "react";
import { Outlet, useLocation, useNavigate, useParams } from "react-router-dom";

import AppShell from "../components/AppShell";
import FilesSidebar from "../components/FilesSidebar";
import SessionSidebar from "../components/SessionSidebar";
import { useAgentSocket } from "../hooks/useAgentSocket";
import { useConfig } from "../hooks/useConfig";
import { useFiles } from "../hooks/useFiles";
import { usePanelLayout } from "../hooks/usePanelLayout";
import { useProjects } from "../hooks/useProjects";
import { useSessions } from "../hooks/useSessions";

export default function RootLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { sessionId } = useParams();

  const activeKey = sessionId ?? "default";
  const sessions = useSessions("default");
  const projects = useProjects();
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

  // Create a new session immediately and navigate to it
  const handleNewSession = useCallback(() => {
    const sessionKey = crypto.randomUUID();
    handleSessionSelect(sessionKey);
  }, [handleSessionSelect]);

  // Create a new session in a specific project (workspace)
  const handleNewInProject = useCallback(
    async (workspace: string) => {
      const sessionKey = crypto.randomUUID();
      // Pre-set workspace via PATCH before navigating
      try {
        // Trigger session creation via GET, then set workspace
        await fetch(`/api/sessions/${encodeURIComponent(sessionKey)}`);
        await fetch(`/api/sessions/${encodeURIComponent(sessionKey)}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ workspace }),
        });
      } catch {
        // Ignore — session will be created on first load anyway
      }
      handleSessionSelect(sessionKey);
    },
    [handleSessionSelect]
  );

  // Derive configDir from sessions.dir: <configDir>/workspace/sessions → configDir
  const defaultWorkspace = useMemo(() => {
    const dir = config.config?.sessions?.dir;
    if (dir && dir.endsWith("/workspace/sessions")) {
      return dir.slice(0, -"/workspace/sessions".length);
    }
    return dir ?? "";
  }, [config.config?.sessions?.dir]);

  const grouped = projects.getGrouped(sessions.sessions, defaultWorkspace);

  return (
    <>
      <AppShell
        sessionSidebar={
          <SessionSidebar
            sessions={sessions.sessions}
            activeKey={activeKey}
            onSelect={handleSessionSelect}
            onNew={handleNewSession}
            onNewInProject={handleNewInProject}
            onToggleCollapse={toggleLeft}
            onDelete={sessions.deleteSession}
            onRename={sessions.setDisplayName}
            getDisplayName={sessions.getDisplayName}
            projects={grouped.projects}
            projectMap={grouped.projectMap}
            orphans={grouped.orphans}
            collapsed={leftCollapsed}
          />
        }
        filesSidebar={
          isChatPage ? (
            <FilesSidebar
              tree={files.tree}
              selectedPath={files.selected?.path}
              selectedContent={files.selected?.content}
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
            projects,
            activeKey,
            lastChatKey: lastChatKeyRef.current,
            toggleRight,
            isRightCollapsed: rightCollapsed,
            defaultWorkspace,
          }}
        />
      </AppShell>

    </>
  );
}
