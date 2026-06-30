import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

export type ToolStepStatus = "pending" | "ok" | "error" | "approval" | "done";

export interface ToolStep {
  id: string;
  kind: "thinking" | "tool";
  title: string;
  status: ToolStepStatus;
  detail?: string;
}

interface ToolCallCardProps {
  step: ToolStep;
  isLast: boolean;
  /** When nested inside a group, show indent + vertical line */
  nested?: boolean;
}

function parseDetail(detail?: string): { input?: string; output?: string } {
  if (!detail) return {};
  try {
    const parsed = JSON.parse(detail);
    if (typeof parsed === "object" && parsed !== null) {
      return { input: JSON.stringify(parsed, null, 2) };
    }
  } catch { /* not JSON */ }
  return { output: detail };
}

export default function ToolCallCard({ step, isLast, nested = false }: ToolCallCardProps) {
  const [expanded, setExpanded] = useState(false);
  const { input, output } = parseDetail(step.detail);
  const hasContent = Boolean(input || output);
  const running = step.status === "pending" || step.status === "approval";
  const error = step.status === "error";

  return (
    <div className="flex">
      {/* Indent + vertical line — only when nested */}
      {nested && (
        <div className="relative shrink-0" style={{ width: 20 }}>
          <div
            className="absolute left-1/2 w-px -translate-x-1/2 bg-connector"
            style={{ top: 0, bottom: 0 }}
          />
        </div>
      )}

      {/* Inline tool indicator */}
      <div className="min-w-0 flex-1">
        <button
          className={`group inline-flex items-center gap-1 rounded px-1.5 leading-relaxed transition-colors -ml-0.5 ${
            error ? "text-red/80" : running ? "text-accent/80" : "text-muted"
          } hover:bg-line/30`}
          onClick={() => setExpanded((v) => !v)}
          type="button"
        >
          <span className="font-mono text-[11px] font-medium">
            [{step.title}]
          </span>
          {running && (
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-accent animate-pulse" />
          )}
          {hasContent && (
            <span className="text-[10px]">
              {expanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
            </span>
          )}
        </button>

        {expanded && hasContent && (
          <div className="ml-2 mt-1 space-y-1.5">
            {input && (
              <div>
                <div className="mb-0.5 font-mono text-[10px] text-[#9aa2aa]">args</div>
                <pre className="whitespace-pre-wrap rounded border border-line bg-[#fafbfa] p-2 font-mono text-[11px] leading-relaxed text-muted max-h-32 overflow-y-auto">
                  {input}
                </pre>
              </div>
            )}
            {output && (
              <div>
                <div className="mb-0.5 font-mono text-[10px] text-[#9aa2aa]">result</div>
                <pre className="whitespace-pre-wrap rounded border border-line bg-[#fafbfa] p-2 font-mono text-[11px] leading-relaxed text-muted max-h-32 overflow-y-auto">
                  {output}
                </pre>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
