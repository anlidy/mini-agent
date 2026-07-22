import { useCallback, useEffect, useRef } from "react";
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
  const files = useFiles(activeKey, sessions.activeSession?.revision);
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
      void (async () => {
        const loaded = await sessions.loadSession(sessionId);
        if (!loaded && sessionId === "default") {
          try {
            await sessions.createSession({ key: sessionId, workspace: null });
            await sessions.loadSession(sessionId);
          } catch {
            // useSessions exposes the actionable API error in the chat surface.
          }
        }
      })();
    }
  }, [sessionId, sessions.loadSession, sessions.createSession]);

  // Use route path rather than Boolean(sessionId) so new non-chat routes
  // don't accidentally inherit chat layout.
  const isChatPage = location.pathname.startsWith("/chat");
  const socket = useAgentSocket(activeKey, {
    onDone: refreshActiveSession,
    enabled: isChatPage && sessions.activeSession?.key === activeKey
  });

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
    void sessions.createSession({ workspace: null })
      .then((session) => handleSessionSelect(session.key))
      .catch(() => undefined);
  }, [handleSessionSelect, sessions.createSession]);

  // Create a new session in a specific project (workspace)
  const handleNewInProject = useCallback(
    (workspace: string) => {
      void sessions.createSession({ workspace })
        .then((session) => handleSessionSelect(session.key))
        .catch(() => undefined);
    },
    [handleSessionSelect, sessions.createSession]
  );

  const defaultWorkspace = sessions.activeSession?.effectiveWorkspace ?? "";

  const grouped = projects.getGrouped(sessions.sessions);

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
