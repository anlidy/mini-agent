import { Settings } from "lucide-react";
import type { ReactNode } from "react";

interface AppShellProps {
  sessionSidebar: ReactNode;
  filesSidebar: ReactNode;
  children: ReactNode;
  onOpenSettings(): void;
  settingsDisabled?: boolean;
}

export default function AppShell({
  sessionSidebar,
  filesSidebar,
  children,
  onOpenSettings,
  settingsDisabled = false
}: AppShellProps) {
  const workspacePath = window.location.pathname || "/";

  return (
    <div className="min-h-screen bg-background px-5 py-7 text-text">
      <div className="mx-auto max-w-[1280px] overflow-hidden rounded-[12px] border border-[#d4dad6] bg-surface shadow-[0_24px_70px_rgba(30,35,42,0.10)]">
        <header className="grid min-h-[52px] grid-cols-[220px_minmax(0,1fr)_240px] items-center gap-3 border-b border-line px-[15px] max-lg:grid-cols-[minmax(0,1fr)_auto]">
          <div className="flex items-center gap-2.5 font-bold text-ink">
            <div className="grid h-7 w-7 place-items-center rounded-[7px] bg-ink font-mono text-[11px] font-bold text-white">
              ma
            </div>
            <span>mini-agent</span>
          </div>
          <div className="truncate font-mono text-xs text-muted max-lg:hidden">{workspacePath}</div>
          <button
            className="hidden h-8 w-8 place-items-center rounded-ui border border-line bg-white text-text disabled:opacity-50 max-lg:grid"
            disabled={settingsDisabled}
            onClick={onOpenSettings}
            type="button"
            aria-label="Open settings"
          >
            <Settings size={15} />
          </button>
        </header>
        <div className="grid min-h-[746px] grid-cols-[220px_minmax(0,1fr)_240px] max-lg:grid-cols-1">
          <aside className="border-r border-line bg-[#fafbf9] max-lg:hidden">{sessionSidebar}</aside>
          <main className="min-w-0 bg-surface">{children}</main>
          <aside className="border-l border-line bg-[#fafbf9] max-lg:hidden">{filesSidebar}</aside>
        </div>
      </div>
    </div>
  );
}
