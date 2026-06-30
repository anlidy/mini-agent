import { ShieldAlert } from "lucide-react";
import type { ApprovalRequest } from "../hooks/useAgentSocket";

interface ApprovalCardProps {
  approval?: ApprovalRequest;
  onResolve(approved: boolean): void;
}

export default function ApprovalCard({ approval, onResolve }: ApprovalCardProps) {
  if (!approval || approval.resolved) {
    return null;
  }

  return (
    <div className="mx-auto mb-3 max-w-[800px] rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 shadow-lg">
      <div className="mb-2 flex items-center gap-2">
        <ShieldAlert size={15} className="text-amber-600" />
        <span className="text-[13px] font-semibold text-ink">Approve command?</span>
      </div>
      <code className="mb-3 block break-words rounded border border-amber-200 bg-white px-3 py-2 font-mono text-xs text-ink">
        {approval.command}
      </code>
      <div className="flex gap-2">
        <button
          className="h-7 rounded-md bg-ink px-3 text-[12px] font-medium text-white hover:bg-ink/80"
          onClick={() => onResolve(true)}
          type="button"
        >
          Approve
        </button>
        <button
          className="h-7 rounded-md border border-red/30 bg-white px-3 text-[12px] font-medium text-red hover:bg-red/5"
          onClick={() => onResolve(false)}
          type="button"
        >
          Deny
        </button>
      </div>
    </div>
  );
}
