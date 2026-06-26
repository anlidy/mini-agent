import { useCallback, useState } from "react";

import AppShell from "./components/AppShell";
import ChatThread from "./components/ChatThread";
import FilesSidebar from "./components/FilesSidebar";
import SettingsView from "./components/SettingsView";
import SessionSidebar from "./components/SessionSidebar";
import { useAgentSocket } from "./hooks/useAgentSocket";
import { useConfig } from "./hooks/useConfig";
import { useFiles } from "./hooks/useFiles";
import { useSessions } from "./hooks/useSessions";

export default function App() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const sessions = useSessions("default");
  const config = useConfig();
  const files = useFiles();
  const refreshActiveSession = useCallback(() => {
    void sessions.loadSession(sessions.activeKey);
    void sessions.refresh();
  }, [sessions.activeKey, sessions.loadSession, sessions.refresh]);
  const socket = useAgentSocket(sessions.activeKey, { onDone: refreshActiveSession });
  const settingsBlocked = socket.active || Boolean(socket.approval && !socket.approval.resolved);

  function openSettings() {
    if (!settingsBlocked) {
      setSettingsOpen(true);
    }
  }

  return (
    <AppShell
      sessionSidebar={
        <SessionSidebar
          sessions={sessions.sessions}
          activeKey={sessions.activeKey}
          onSelect={sessions.loadSession}
          onNew={() => void sessions.loadSession(`session-${Date.now()}`)}
          onOpenSettings={openSettings}
          settingsDisabled={settingsBlocked}
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
        />
      }
      onOpenSettings={openSettings}
      settingsDisabled={settingsBlocked}
    >
      {settingsOpen ? (
        <SettingsView onClose={() => setSettingsOpen(false)} />
      ) : (
        <ChatThread
          sessionKey={sessions.activeKey}
          messages={sessions.activeSession?.messages ?? []}
          assistantDraft={socket.assistantDraft}
          steps={socket.steps}
          approval={socket.approval}
          connected={socket.connected}
          active={socket.active}
          aborting={socket.aborting}
          error={socket.error ?? sessions.error}
          onSend={socket.send}
          onApprove={socket.resolveApproval}
          onAbort={socket.abort}
        />
      )}
    </AppShell>
  );
}
