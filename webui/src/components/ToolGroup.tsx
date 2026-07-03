import { useState } from "react";
import ToolCallCard, { type ToolStep } from "./ToolCallCard";

/* ------------------------------------------------------------------ */
/*  Tool group — wraps consecutive tool calls                        */
/* ------------------------------------------------------------------ */

export default function ToolGroup({ steps }: { steps: ToolStep[] }) {
  const [expanded, setExpanded] = useState(false);

  // Single tool: no group wrapper, no indent
  if (steps.length === 1) {
    return <ToolCallCard step={steps[0]!} isLast={true} nested={false} />;
  }

  const running = steps.filter((s) => s.status === "pending" || s.status === "approval").length;

  return (
    <div className="mb-1">
      {/* Group header */}
      <button
        className="group inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 leading-relaxed text-ink-muted transition-colors duration-fast hover:bg-muted -ml-0.5"
        onClick={() => setExpanded((v) => !v)}
        type="button"
      >
        <span className="font-mono text-[11px] font-medium">[tools]</span>
        <span className="text-[11px]">({steps.length})</span>
        {running > 0 && (
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-accent animate-pulse" />
        )}
        <span className="text-[10px] text-ink-muted/70">
          {expanded ? "▾" : "▸"}
        </span>
      </button>

      {/* Expanded children with indent + vertical lines */}
      {expanded && (
        <div>
          {steps.map((step, i) => (
            <ToolCallCard
              key={step.id}
              step={step}
              isLast={i === steps.length - 1}
              nested
            />
          ))}
        </div>
      )}
    </div>
  );
}
