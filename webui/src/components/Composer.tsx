import { useRef, useEffect, useState } from "react";
import { ChevronDown, FolderOpen, Send, Square } from "lucide-react";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";
import {
  Popover,
  PopoverContent,
  PopoverItem,
  PopoverTrigger,
} from "./ui/popover";
import type { AgentConfig, ProviderConfig } from "../api/types";

export interface ModelConfig {
  agentKey: string;
  provider: string;
  model: string;
  thinking: boolean;
  effort: 1 | 2 | 3 | 4;
}

interface ComposerProps {
  disabled: boolean;
  value: string;
  active?: boolean;
  aborting?: boolean;
  onChange(value: string): void;
  onSend(text: string): void;
  onAbort?(): void;
  workspacePath?: string;
  onWorkspaceChange?(path: string): void;
  placeholder?: string;
  /* ---- model config ---- */
  agents?: Record<string, AgentConfig>;
  providers?: Record<string, ProviderConfig>;
  currentConfig?: ModelConfig;
  onConfigChange?(config: ModelConfig): void;
  onOpenSettings?(): void;
}

const EFFORT_LABELS: Record<number, string> = {
  1: "自动",
  2: "低",
  3: "中",
  4: "高"
};

export default function Composer({
  disabled,
  value,
  active = false,
  aborting = false,
  onChange,
  onSend,
  onAbort,
  workspacePath,
  onWorkspaceChange,
  placeholder = "问任何问题...",
  agents,
  providers,
  currentConfig,
  onConfigChange,
  onOpenSettings,
}: ComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [expandedRow, setExpandedRow] = useState<"provider" | "model" | "thinking" | null>(null);

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

  const agentKeys = Object.keys(agents ?? {});
  const hasConfig = agentKeys.length > 0 && providers && onConfigChange && currentConfig;
  const isAnthropic = providers?.[currentConfig?.provider ?? ""]?.type === "anthropic";
  const modelList = providers?.[currentConfig?.provider ?? ""]?.models ?? [];

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

          {/* Model config popover */}
          {hasConfig ? (
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
                    <span className="max-w-[140px] truncate">
                      {currentConfig.model}
                    </span>
                    <ChevronDown size={11} />
                  </Button>
                )}
              />
              <PopoverContent align="end" side="top" sideOffset={8} className="w-72 p-3">
                <div className="space-y-1">
                  {/* Row 1: Provider */}
                  <button
                    type="button"
                    onClick={() => setExpandedRow(expandedRow === "provider" ? null : "provider")}
                    className="flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-[13px] hover:bg-muted transition-colors duration-fast"
                  >
                    <span>
                      <span className="text-ink-muted">Provider: </span>
                      <span className="text-ink font-medium">{currentConfig.provider}</span>
                    </span>
                    <ChevronDown size={11} className={`text-ink-muted transition-transform duration-fast ${expandedRow === "provider" ? "rotate-180" : ""}`} />
                  </button>
                  {expandedRow === "provider" && (
                    <div className="mx-1 mb-1 rounded-lg bg-muted/50 px-2 py-2 space-y-0.5">
                      {Object.entries(providers).map(([key, p]) => (
                        <button
                          key={key}
                          type="button"
                          onClick={() => {
                            onConfigChange({
                              ...currentConfig,
                              provider: key,
                              thinking: p.type === "anthropic" ? currentConfig.thinking : false
                            });
                            setExpandedRow(null);
                          }}
                          className={`flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-[13px] transition-colors duration-fast ${
                            currentConfig.provider === key
                              ? "bg-accent/10 text-accent font-medium"
                              : "text-ink hover:bg-surface"
                          }`}
                        >
                          <span className={`h-2.5 w-2.5 rounded-full border-2 shrink-0 ${
                            currentConfig.provider === key ? "border-accent bg-accent" : "border-line/50"
                          }`} />
                          {key}
                          <span className="text-[11px] text-ink-muted">({p.type})</span>
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Row 2: Model */}
                  <button
                    type="button"
                    onClick={() => setExpandedRow(expandedRow === "model" ? null : "model")}
                    className="flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-[13px] hover:bg-muted transition-colors duration-fast"
                  >
                    <span>
                      <span className="text-ink-muted">Model: </span>
                      <span className="text-ink font-medium">{currentConfig.model}</span>
                    </span>
                    <ChevronDown size={11} className={`text-ink-muted transition-transform duration-fast ${expandedRow === "model" ? "rotate-180" : ""}`} />
                  </button>
                  {expandedRow === "model" && (
                    <div className="mx-1 mb-1 rounded-lg bg-muted/50 px-2 py-2 space-y-2">
                      <input
                        className="h-8 w-full rounded-lg border border-line/30 bg-surface px-2.5 text-[13px] outline-none transition-colors duration-fast focus-visible:border-accent/50 font-mono"
                        value={currentConfig.model}
                        onChange={(e) => onConfigChange({ ...currentConfig, model: e.target.value })}
                        placeholder="model name"
                        type="text"
                      />
                      {modelList.length > 0 && (
                        <div className="space-y-0.5">
                          {modelList.map((m) => (
                            <button
                              key={m}
                              type="button"
                              onClick={() => {
                                onConfigChange({ ...currentConfig, model: m });
                                setExpandedRow(null);
                              }}
                              className={`flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-[13px] transition-colors duration-fast ${
                                currentConfig.model === m
                                  ? "bg-accent/10 text-accent font-medium"
                                  : "text-ink hover:bg-surface"
                              }`}
                            >
                              <span className={`h-2.5 w-2.5 rounded-full border-2 shrink-0 ${
                                currentConfig.model === m ? "border-accent bg-accent" : "border-line/50"
                              }`} />
                              <span className="font-mono truncate">{m}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Row 3: Thinking + Effort */}
                  <button
                    type="button"
                    onClick={() => setExpandedRow(expandedRow === "thinking" ? null : "thinking")}
                    className="flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-[13px] hover:bg-muted transition-colors duration-fast"
                  >
                    <span>
                      <span className="text-ink-muted">Thinking · </span>
                      <span className="text-ink font-medium">{EFFORT_LABELS[currentConfig.effort]}</span>
                    </span>
                    <ChevronDown size={11} className={`text-ink-muted transition-transform duration-fast ${expandedRow === "thinking" ? "rotate-180" : ""}`} />
                  </button>
                  {expandedRow === "thinking" && (
                    <div className="mx-1 mb-1 rounded-lg bg-muted/50 px-2 py-2 space-y-2">
                      {isAnthropic && (
                        <div className="flex items-center justify-between">
                          <span className="text-[12px] text-ink-muted">Thinking</span>
                          <label className="relative inline-flex cursor-pointer items-center">
                            <input
                              checked={currentConfig.thinking}
                              onChange={(e) =>
                                onConfigChange({ ...currentConfig, thinking: e.target.checked })
                              }
                              type="checkbox"
                              className="peer sr-only"
                            />
                            <div className="h-5 w-9 rounded-full bg-muted peer-checked:bg-accent peer-focus:outline-none transition-colors duration-fast after:absolute after:start-[2px] after:top-[2px] after:h-4 after:w-4 after:rounded-full after:bg-white after:transition-transform after:duration-fast peer-checked:after:translate-x-full" />
                          </label>
                        </div>
                      )}
                      <div className="grid gap-1.5">
                        <span className="text-[11px] font-medium text-ink-muted">Effort</span>
                        <div className="flex gap-1">
                          {([1, 2, 3, 4] as const).map((level) => (
                            <button
                              key={level}
                              type="button"
                              onClick={() => onConfigChange({ ...currentConfig, effort: level })}
                              className={`flex-1 rounded-md py-1 text-[12px] font-medium transition-colors duration-fast ${
                                currentConfig.effort === level
                                  ? "bg-accent text-white"
                                  : "bg-muted text-ink-muted hover:bg-muted/80"
                              }`}
                            >
                              {EFFORT_LABELS[level]}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </PopoverContent>
            </Popover>
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
