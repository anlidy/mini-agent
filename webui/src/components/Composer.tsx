import { useRef, useEffect } from "react";
import { ChevronDown, FolderOpen, Send, Square } from "lucide-react";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";
import {
  Popover,
  PopoverContent,
  PopoverItem,
  PopoverTrigger,
} from "./ui/popover";

interface ComposerProps {
  disabled: boolean;
  value: string;
  active?: boolean;
  aborting?: boolean;
  onChange(value: string): void;
  onSend(text: string): void;
  onAbort?(): void;
  models?: string[];
  currentModel?: string;
  onModelChange?(model: string): void;
  workspacePath?: string;
  onWorkspaceChange?(path: string): void;
  placeholder?: string;
}

export default function Composer({
  disabled,
  value,
  active = false,
  aborting = false,
  onChange,
  onSend,
  onAbort,
  models,
  currentModel,
  onModelChange,
  workspacePath,
  onWorkspaceChange,
  placeholder = "问任何问题...",
}: ComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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
    <div className="bg-background px-4 py-3">
      <div className="rounded-2xl border border-line/30 bg-surface shadow-sm transition-all duration-fast focus-within:border-accent/40 focus-within:shadow-md">
        <Textarea
          ref={textareaRef}
          className="min-h-[44px] max-h-[200px] w-full resize-none overflow-hidden border-0 bg-transparent px-4 pt-4 pb-1 text-[15px] leading-relaxed text-ink shadow-none outline-none placeholder:text-ink-muted/70 focus-visible:ring-0"
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              submit();
            }
          }}
          placeholder={placeholder}
          rows={1}
          value={value}
        />

        <div className="flex items-center gap-1 px-2.5 pb-2.5">
          {/* Workspace selector */}
          {workspacePath !== undefined && onWorkspaceChange ? (
            <Popover>
              <PopoverTrigger
                render={(props) => (
                  <Button
                    variant="ghost"
                    size="xs"
                    type="button"
                    className="gap-1 rounded-lg text-[12px] text-ink-muted hover:text-ink"
                    {...props}
                  >
                    <FolderOpen size={13} />
                    <span className="max-w-[120px] truncate">
                      {workspacePath.split("/").pop() || workspacePath || "选择项目..."}
                    </span>
                    <ChevronDown size={10} />
                  </Button>
                )}
              />
              <PopoverContent align="start" side="top" sideOffset={8} className="w-80">
                <div className="flex items-center gap-2 p-1">
                  <input
                    className="flex-1 rounded-lg border border-line/30 bg-surface px-2.5 py-1.5 text-[13px] outline-none transition-colors duration-fast focus:border-accent/50"
                    defaultValue={workspacePath}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        onWorkspaceChange((e.target as HTMLInputElement).value.trim());
                        e.preventDefault();
                      }
                    }}
                    placeholder="/path/to/project"
                    type="text"
                  />
                  <Button
                    variant="default"
                    size="xs"
                    onClick={(e) => {
                      const input = (e.currentTarget.previousElementSibling as HTMLInputElement);
                      if (input) onWorkspaceChange(input.value.trim());
                    }}
                    type="button"
                  >
                    OK
                  </Button>
                </div>
              </PopoverContent>
            </Popover>
          ) : null}

          <div className="flex-1" aria-hidden="true" />

          {/* Keyboard hint */}
          <span className="hidden pr-2 text-[11px] text-ink-muted/70 sm:block">
            Enter 发送 · Shift+Enter 换行
          </span>

          {/* Model selector */}
          {models && models.length > 0 && onModelChange ? (
            <Popover>
              <PopoverTrigger
                render={(props) => (
                  <Button
                    variant="ghost"
                    size="xs"
                    type="button"
                    className="gap-1 text-[12px] text-ink-muted hover:text-ink"
                    {...props}
                  >
                    <span className="max-w-[100px] truncate">
                      {currentModel || models[0]}
                    </span>
                    <ChevronDown size={11} />
                  </Button>
                )}
              />
              <PopoverContent align="end" side="top" sideOffset={8}>
                {models.map((model) => (
                  <PopoverItem
                    key={model}
                    onClick={() => onModelChange(model)}
                  >
                    <span className={model === (currentModel || models[0]) ? "font-semibold text-ink" : ""}>
                      {model}
                    </span>
                  </PopoverItem>
                ))}
              </PopoverContent>
            </Popover>
          ) : models && models.length > 0 ? (
            <span className="inline-flex max-w-[120px] items-center rounded-md px-2 text-[12px] text-ink-muted">
              <span className="truncate">{currentModel || models[0]}</span>
            </span>
          ) : null}

          {/* Send / Abort button */}
          <Button
            aria-label={active ? "Abort turn" : "Send"}
            className="h-[30px] w-[30px] shrink-0 rounded-full"
            variant={active ? "destructive" : "default"}
            size="icon"
            disabled={active ? aborting : disabled || !value.trim()}
            onClick={active ? onAbort : submit}
            type="button"
          >
            {active ? <Square size={12} fill="currentColor" /> : <Send size={14} />}
          </Button>
        </div>
      </div>
    </div>
  );
}
