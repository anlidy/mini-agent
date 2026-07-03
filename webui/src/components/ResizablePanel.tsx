import { useCallback, useEffect, useRef } from "react";
import { Button } from "./ui/button";

interface ResizablePanelProps {
  collapsed: boolean;
  onToggle(): void;
  width: number;
  onWidthChange(width: number): void;
  minWidth?: number;
  maxWidth?: number;
  side: "left" | "right";
  children: React.ReactNode;
}

const COLLAPSED_W = 48;

export default function ResizablePanel({
  collapsed,
  onToggle,
  width,
  onWidthChange,
  minWidth = 180,
  maxWidth = 480,
  side,
  children
}: ResizablePanelProps) {
  const draggingRef = useRef(false);
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);

  const onMouseDown = useCallback(
    (event: React.MouseEvent) => {
      event.preventDefault();
      draggingRef.current = true;
      startXRef.current = event.clientX;
      startWidthRef.current = width;
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    },
    [width]
  );

  useEffect(() => {
    function onMouseMove(event: MouseEvent) {
      if (!draggingRef.current) return;
      const delta = side === "left" ? event.clientX - startXRef.current : startXRef.current - event.clientX;
      const next = Math.min(maxWidth, Math.max(minWidth, startWidthRef.current + delta));
      onWidthChange(next);
    }

    function onMouseUp() {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    }

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    return () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };
  }, [maxWidth, minWidth, onWidthChange, side]);

  const borderClass = side === "left" ? "border-r" : "border-l";
  const w = collapsed ? COLLAPSED_W : width;

  return (
    <div
      className={`relative flex shrink-0 flex-col overflow-hidden border-line/20 bg-sidebar ${borderClass} transition-[width] duration-300 ease-expo`}
      style={{ width: w }}
    >
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {children}
      </div>
      {/* Drag handle — invisible until hover, hidden when collapsed */}
      {!collapsed && (
        <div
          className={`absolute top-0 h-full w-[3px] cursor-col-resize transition-colors duration-fast hover:bg-accent/30 active:bg-accent/50 ${
            side === "left" ? "-right-px" : "-left-px"
          }`}
          style={{ zIndex: 10 }}
          onMouseDown={onMouseDown}
        />
      )}
    </div>
  );
}

export { COLLAPSED_W };
