import type { ApprovalRequest } from "../hooks/useAgentSocket";

interface ApprovalCardProps {
  approval?: ApprovalRequest;
  onResolve(approved: boolean): void;
}

export default function ApprovalCard({ approval, onResolve }: ApprovalCardProps) {
  if (!approval) {
    return null;
  }

  return (
    <section className="mb-5 max-w-[520px] rounded-ui bg-approval-soft p-3.5">
      <strong className="mb-1 block text-sm text-ink">Approve command?</strong>
      <p className="mb-2.5 text-xs leading-relaxed text-muted">
        The agent wants to run this command in the current workspace.
      </p>
      <code className="block break-words rounded-[7px] bg-white/70 px-2.5 py-2 font-mono text-xs text-ink">
        {approval.command}
      </code>
      {approval.resolved ? (
        <div className="mt-2.5 font-mono text-xs text-muted">{approval.resolved}</div>
      ) : (
        <div className="mt-2.5 flex gap-2">
          <button
            className="h-8 rounded-[7px] bg-ink px-3 text-[13px] font-bold text-white"
            onClick={() => onResolve(true)}
            type="button"
          >
            Approve
          </button>
          <button
            className="h-8 rounded-[7px] border border-red/20 bg-white/60 px-3 text-[13px] font-bold text-red"
            onClick={() => onResolve(false)}
            type="button"
          >
            Deny
          </button>
        </div>
      )}
    </section>
  );
}
