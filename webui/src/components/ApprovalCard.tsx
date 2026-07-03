import { ShieldAlert } from "lucide-react";
import type { ApprovalRequest } from "../hooks/useAgentSocket";
import { Button } from "./ui/button";

interface ApprovalCardProps {
  approval?: ApprovalRequest;
  onResolve(approved: boolean): void;
}

export default function ApprovalCard({ approval, onResolve }: ApprovalCardProps) {
  if (!approval || approval.resolved) {
    return null;
  }

  return (
    <div className="mx-auto mb-3 max-w-[760px] rounded-2xl border border-[color-mix(in_oklch,var(--warning),var(--bg-base)_85%)] bg-warning-soft px-4 py-3.5">
      <div className="mb-2.5 flex items-center gap-2">
        <ShieldAlert size={16} className="text-warning" />
        <span className="text-[13px] font-semibold text-ink">
          Approve command?
        </span>
      </div>
      <code className="mb-3 block break-words rounded-xl border border-line/20 bg-surface px-3.5 py-2.5 font-mono text-[12px] leading-relaxed text-ink">
        {approval.command}
      </code>
      <div className="flex gap-2">
        <Button size="sm" onClick={() => onResolve(true)} type="button">
          Approve
        </Button>
        <Button
          variant="destructive"
          size="sm"
          onClick={() => onResolve(false)}
          type="button"
        >
          Deny
        </Button>
      </div>
    </div>
  );
}
