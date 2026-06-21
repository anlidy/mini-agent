import { Send, Square } from "lucide-react";

interface ComposerProps {
  disabled: boolean;
  value: string;
  active?: boolean;
  aborting?: boolean;
  onChange(value: string): void;
  onSend(text: string): void;
  onAbort?(): void;
}

export default function Composer({
  disabled,
  value,
  active = false,
  aborting = false,
  onChange,
  onSend,
  onAbort
}: ComposerProps) {
  function submit() {
    const trimmed = value.trim();
    if (!trimmed || disabled) {
      return;
    }

    onSend(trimmed);
  }

  return (
    <footer className="border-t border-line py-3.5">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2.5 rounded-[10px] bg-white p-2.5 shadow-[inset_0_0_0_1px_#d4dad6]">
        <textarea
          className="min-h-14 resize-none border-0 bg-transparent text-sm leading-relaxed text-text outline-none placeholder:text-[#9aa2aa]"
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              submit();
            }
          }}
          placeholder="Ask mini-agent to inspect files, edit code, run tools, or continue this task..."
          value={value}
        />
        <button
          aria-label={active ? "Abort turn" : "Send"}
          className={`grid h-[38px] w-[38px] place-items-center rounded-ui text-white disabled:opacity-40 ${
            active ? "bg-red" : "bg-ink"
          }`}
          disabled={active ? aborting : disabled || !value.trim()}
          onClick={active ? onAbort : submit}
          type="button"
        >
          {active ? <Square size={14} fill="currentColor" /> : <Send size={16} />}
        </button>
      </div>
      <div className="mt-2 flex justify-between font-mono text-[11px] text-[#9aa2aa]">
        <span>Enter to send</span>
        <span>Shift+Enter newline</span>
      </div>
    </footer>
  );
}
