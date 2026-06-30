import { useCallback, useState } from "react";

import AppShell from "./components/AppShell";
import ChatThread from "./components/ChatThread";
import FilesSidebar from "./components/FilesSidebar";
import SessionSidebar from "./components/SessionSidebar";
import { useAgentSocket } from "./hooks/useAgentSocket";
import { useConfig } from "./hooks/useConfig";
import { useFiles } from "./hooks/useFiles";
import { useSessions } from "./hooks/useSessions";

function readStoredWidth(key: string, fallback: number): number {
  try {
    const stored = localStorage.getItem(key);
    if (stored) {
      const parsed = Number(stored);
      if (Number.isInteger(parsed) && parsed >= 180 && parsed <= 480) {
        return parsed;
      }
    }
  } catch {
    // ignore
  }
  return fallback;
}

function writeStoredWidth(key: string, width: number): void {
  try {
    localStorage.setItem(key, width.toString());
  } catch {
    // ignore
  }
}

export default function App() {
  const sessions = useSessions("default");
  const config = useConfig();
  const files = useFiles();
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);
  const [leftWidth, setLeftWidth] = useState(() => readStoredWidth("mini-agent.leftPanelWidth", 260));
  const [rightWidth, setRightWidth] = useState(() => readStoredWidth("mini-agent.rightPanelWidth", 300));

  const refreshActiveSession = useCallback(() => {
    void sessions.loadSession(sessions.activeKey);
    void sessions.refresh();
  }, [sessions.activeKey, sessions.loadSession, sessions.refresh]);
  const socket = useAgentSocket(sessions.activeKey, { onDone: refreshActiveSession });

  const handleLeftWidthChange = useCallback((width: number) => {
    setLeftWidth(width);
    writeStoredWidth("mini-agent.leftPanelWidth", width);
  }, []);

  const handleRightWidthChange = useCallback((width: number) => {
    setRightWidth(width);
    writeStoredWidth("mini-agent.rightPanelWidth", width);
  }, []);

  return (
    <AppShell
      workspacePath={config.config?.workspace}
      sessionSidebar={
        <SessionSidebar
          sessions={sessions.sessions}
          activeKey={sessions.activeKey}
          onSelect={sessions.loadSession}
          onNew={() => void sessions.loadSession(`session-${crypto.randomUUID()}`)}
          onToggleCollapse={() => setLeftCollapsed((c) => !c)}
        />
      }
      filesSidebar={
        <FilesSidebar
          tree={files.tree}
          selectedPath={files.selected?.path}
          selectedContent={files.selected?.content}
          workspacePath={config.config?.workspace}
          error={files.error}
          onSelect={files.selectFile}
          onRefresh={files.refreshTree}
          onToggleCollapse={() => setRightCollapsed((c) => !c)}
        />
      }
      leftCollapsed={leftCollapsed}
      rightCollapsed={rightCollapsed}
      leftWidth={leftWidth}
      rightWidth={rightWidth}
      onToggleLeft={() => setLeftCollapsed((c) => !c)}
      onToggleRight={() => setRightCollapsed((c) => !c)}
      onLeftWidthChange={handleLeftWidthChange}
      onRightWidthChange={handleRightWidthChange}
    >
      <ChatThread
        sessionKey={sessions.activeKey}
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
      />
    </AppShell>
  );
}
