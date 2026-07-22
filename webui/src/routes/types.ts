import type { useAgentSocket } from "../hooks/useAgentSocket";
import type { useConfig } from "../hooks/useConfig";
import type { useFiles } from "../hooks/useFiles";
import type { useProjects } from "../hooks/useProjects";
import type { useSessions } from "../hooks/useSessions";

export interface RootContext {
  sessions: ReturnType<typeof useSessions>;
  config: ReturnType<typeof useConfig>;
  files: ReturnType<typeof useFiles>;
  socket: ReturnType<typeof useAgentSocket>;
  projects: ReturnType<typeof useProjects>;
  activeKey: string;
  /** The last chat session key — used by SettingsPage to navigate back. */
  lastChatKey: string;
  toggleRight(): void;
  isRightCollapsed: boolean;
  /** Effective workspace returned by the active Session API. */
  defaultWorkspace: string;
}
