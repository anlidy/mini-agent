import type { ExecutionStep } from "../hooks/useAgentSocket";

interface ExecutionChainProps {
  steps: ExecutionStep[];
}

export default function ExecutionChain({ steps }: ExecutionChainProps) {
  const visibleSteps = steps.filter((step) => step.kind === "tool" || Boolean(step.detail));

  if (visibleSteps.length === 0) {
    return null;
  }

  return (
    <details className="mb-5 rounded-ui bg-[#f8faf8] shadow-[inset_0_0_0_1px_#e1e5e2]" open>
      <summary className="flex min-h-[42px] cursor-pointer list-none items-center gap-2 px-3 text-sm text-muted">
        <span className="font-mono text-[11px] font-bold text-accent">&gt;</span>
        <span className="font-bold text-text">Execution chain</span>
        <span className="ml-auto font-mono text-[11px] text-[#9aa2aa]">{visibleSteps.length} steps</span>
      </summary>
      <div className="px-3 pb-2">
        {visibleSteps.map((step) => (
          <details key={step.id} className="border-t border-line" open={step.status === "approval"}>
            <summary className="flex min-h-[38px] cursor-pointer list-none items-center gap-2">
              <span className="font-mono text-[11px] font-bold text-accent">&gt;</span>
              <span
                className={`whitespace-nowrap font-mono text-[11px] ${
                  step.kind === "tool" ? "text-green" : "text-accent"
                }`}
              >
                [{step.kind}]
              </span>
              <span className="truncate text-[13px] text-text">{step.title}</span>
              <span className="ml-auto whitespace-nowrap font-mono text-[10px] text-muted">{step.status}</span>
            </summary>
            {step.detail ? (
              <pre className="mb-3 ml-7 whitespace-pre-wrap rounded-[7px] bg-[#111418] p-2.5 font-mono text-[11px] leading-relaxed text-[#dde7f3]">
                {step.detail}
              </pre>
            ) : null}
          </details>
        ))}
      </div>
    </details>
  );
}
