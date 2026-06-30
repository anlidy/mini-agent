import { useMemo, useState } from "react";
import { ChevronLeft, MessageSquarePlus, Search } from "lucide-react";

import type { SessionSummary } from "../api/types";

interface SessionSidebarProps {
  sessions: SessionSummary[];
  activeKey: string;
  onSelect(key: string): void;
  onNew(): void;
  onToggleCollapse(): void;
}

export default function SessionSidebar({
  sessions,
  activeKey,
  onSelect,
  onNew,
  onToggleCollapse
}: SessionSidebarProps) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sessions;
    return sessions.filter(
      (s) => s.key.toLowerCase().includes(q) || s.preview.toLowerCase().includes(q)
    );
  }, [sessions, query]);

  return (
    <div className="flex h-full flex-col">
      {/* Top row: collapse + new session */}
      <div className="flex items-center justify-between px-3 pt-3 pb-2">
        <button
          className="grid h-7 w-7 place-items-center rounded-md text-muted hover:bg-line/50 hover:text-text"
          onClick={onToggleCollapse}
          type="button"
          aria-label="Collapse panel"
        >
          <ChevronLeft size={15} />
        </button>
        <button
          className="grid h-7 w-7 place-items-center rounded-md text-muted hover:bg-line/50 hover:text-text"
          onClick={onNew}
          type="button"
          aria-label="New session"
        >
          <MessageSquarePlus size={15} />
        </button>
      </div>

      {/* Search */}
      <div className="px-3 pb-2">
        <div className="flex items-center gap-1.5 rounded-md border border-line bg-white px-2.5 py-1.5">
          <Search size={13} className="shrink-0 text-muted" />
          <input
            className="min-w-0 flex-1 border-0 bg-transparent text-[13px] text-text outline-none placeholder:text-[#9aa2aa]"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search sessions..."
            type="text"
          />
        </div>
      </div>

      {/* Session list */}
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
        {filtered.length === 0 ? (
          <div className="mt-8 text-center text-[13px] text-muted">
            {query.trim() ? "No matching sessions" : "No sessions yet"}
          </div>
        ) : (
          filtered.map((session) => (
            <button
              key={session.key}
              className={`mb-0.5 w-full rounded-lg px-2.5 py-2 text-left transition-colors ${
                session.key === activeKey
                  ? "bg-white text-text shadow-[inset_0_0_0_1px_#e1e5e2]"
                  : "text-muted hover:bg-white/60"
              }`}
              aria-current={session.key === activeKey ? "page" : undefined}
              onClick={() => onSelect(session.key)}
              type="button"
            >
              <div className="truncate text-[13px] font-medium">{session.key}</div>
              <div className="mt-0.5 line-clamp-2 text-[12px] leading-relaxed">
                {session.preview || "Empty session"}
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
