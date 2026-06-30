import type { ReactNode } from "react";
import ResizablePanel from "./ResizablePanel";

interface AppShellProps {
  workspacePath?: string;
  sessionSidebar: ReactNode;
  filesSidebar: ReactNode;
  children: ReactNode;
  leftCollapsed: boolean;
  rightCollapsed: boolean;
  leftWidth: number;
  rightWidth: number;
  onToggleLeft(): void;
  onToggleRight(): void;
  onLeftWidthChange(width: number): void;
  onRightWidthChange(width: number): void;
}

export default function AppShell({
  sessionSidebar,
  filesSidebar,
  children,
  leftCollapsed,
  rightCollapsed,
  leftWidth,
  rightWidth,
  onToggleLeft,
  onToggleRight,
  onLeftWidthChange,
  onRightWidthChange
}: AppShellProps) {
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background text-text">
      <ResizablePanel
        collapsed={leftCollapsed}
        onToggle={onToggleLeft}
        width={leftWidth}
        onWidthChange={onLeftWidthChange}
        side="left"
      >
        {sessionSidebar}
      </ResizablePanel>

      <main className="min-h-0 min-w-0 flex-1 overflow-hidden bg-surface">
        {children}
      </main>

      <ResizablePanel
        collapsed={rightCollapsed}
        onToggle={onToggleRight}
        width={rightWidth}
        onWidthChange={onRightWidthChange}
        side="right"
      >
        {filesSidebar}
      </ResizablePanel>
    </div>
  );
}
