import { useCallback, useEffect, useRef } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
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

  // Collapsed: thin bar with a chevron pointing toward the content
  if (collapsed) {
    return (
      <div className="flex shrink-0 flex-col items-center border-line bg-sidebar pt-3" style={{ width: 32 }}>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Expand ${side} panel`}
          onClick={onToggle}
          type="button"
        >
          {side === "left" ? <ChevronRight size={15} /> : <ChevronLeft size={15} />}
        </Button>
      </div>
    );
  }

  const borderClass = side === "left" ? "border-r" : "border-l";

  return (
    <div className={`relative flex shrink-0 flex-col overflow-hidden border-line bg-sidebar ${borderClass}`} style={{ width }}>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {children}
      </div>
      {/* Drag handle */}
      <div
        className={`absolute top-0 h-full w-1 cursor-col-resize hover:bg-accent/20 active:bg-accent/30 ${
          side === "left" ? "-right-0.5" : "-left-0.5"
        }`}
        style={{ zIndex: 10 }}
        onMouseDown={onMouseDown}
      />
    </div>
  );
}
