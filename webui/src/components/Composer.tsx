import { useRef, useEffect } from "react";
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
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = Math.min(el.scrollHeight, 200) + "px";
    }
  }, [value]);

  function submit() {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
  }

  return (
    <div className="border-t border-line bg-surface px-5 py-3">
      <div className="flex items-end gap-2 rounded-xl border border-line bg-white px-3 py-2 shadow-sm focus-within:border-accent/40 focus-within:shadow-md transition-shadow">
        <textarea
          ref={textareaRef}
          className="min-h-[40px] max-h-[200px] flex-1 resize-none border-0 bg-transparent py-1 text-sm leading-relaxed text-text outline-none placeholder:text-[#9aa2aa]"
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              submit();
            }
          }}
          placeholder="Ask mini-agent…"
          rows={1}
          value={value}
        />
        <button
          aria-label={active ? "Abort turn" : "Send"}
          className={`grid h-[34px] w-[34px] shrink-0 place-items-center rounded-lg text-white transition-colors disabled:opacity-40 ${
            active
              ? "bg-red hover:bg-red/80"
              : "bg-ink hover:bg-ink/80"
          }`}
          disabled={active ? aborting : disabled || !value.trim()}
          onClick={active ? onAbort : submit}
          type="button"
        >
          {active ? <Square size={14} fill="currentColor" /> : <Send size={15} />}
        </button>
      </div>
      <div className="mt-1.5 flex justify-center">
        <span className="font-mono text-[11px] text-[#9aa2aa]">Enter to send · Shift+Enter for newline</span>
      </div>
    </div>
  );
}
