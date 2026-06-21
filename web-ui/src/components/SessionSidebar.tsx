import { Plus, Settings } from "lucide-react";

import type { SessionSummary } from "../api/types";

interface SessionSidebarProps {
  sessions: SessionSummary[];
  activeKey: string;
  onSelect(key: string): void;
  onNew(): void;
  onOpenSettings(): void;
  settingsDisabled?: boolean;
}

export default function SessionSidebar({
  sessions,
  activeKey,
  onSelect,
  onNew,
  onOpenSettings,
  settingsDisabled = false
}: SessionSidebarProps) {
  return (
    <div className="relative min-h-[746px]">
      <div className="flex h-12 items-center justify-between px-3 text-xs font-bold uppercase text-muted">
        <span>Sessions</span>
        <button
          className="grid h-[30px] w-[30px] place-items-center rounded-[7px] border border-line bg-white text-text"
          onClick={onNew}
          type="button"
          aria-label="New session"
        >
          <Plus size={14} />
        </button>
      </div>
      <div className="mx-3 mb-2.5 rounded-[7px] bg-white px-2.5 py-2 text-[13px] text-[#9aa2aa] shadow-[inset_0_0_0_1px_#e1e5e2]">
        Search sessions
      </div>
      <div className="px-2">
        {sessions.map((session) => (
          <button
            key={session.key}
            className={`mb-1 w-full rounded-ui p-2.5 text-left text-xs leading-relaxed ${
              session.key === activeKey
                ? "bg-white text-text shadow-[inset_0_0_0_1px_#e1e5e2]"
                : "text-muted"
            }`}
            aria-current={session.key === activeKey ? "page" : undefined}
            onClick={() => onSelect(session.key)}
            type="button"
          >
            <strong className="mb-1 flex justify-between gap-2 text-[13px]">
              <span className="truncate">{session.key}</span>
              <span>{session.messageCount}</span>
            </strong>
            <span className="line-clamp-2">{session.preview}</span>
          </button>
        ))}
      </div>
      <div className="absolute bottom-3 left-3 right-3">
        <button
          className="flex h-8 items-center gap-2 rounded-[7px] px-2 text-xs text-muted disabled:opacity-50"
          disabled={settingsDisabled}
          onClick={onOpenSettings}
          type="button"
          title={settingsDisabled ? "Finish the active turn before opening settings" : undefined}
        >
          <Settings size={14} />
          Settings
        </button>
      </div>
    </div>
  );
}
