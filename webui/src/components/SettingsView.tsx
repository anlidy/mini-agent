import { RefreshCw, Save, Trash2, X, Plus, Cpu, Wrench, Monitor, ChevronLeft } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";

import type { Config } from "../api/types";
import { useConfig } from "../hooks/useConfig";
import { Button } from "./ui/button";
import { Input } from "./ui/input";

interface SettingsViewProps {
  onClose(): void;
}

/* ---- Draft types ---- */

interface ProviderDraft {
  key: string;
  type: "openai" | "anthropic";
  apiKey: string;
  baseUrl: string;
  timeoutMs: string;
  models: string;
  isNew?: boolean;
}

interface AgentDraft {
  key: string;
  provider: string;
  model: string;
  thinkingEnabled: boolean;
  thinkingBudget: string;
  effort: string;
  maxIterations: string;
  maxToolResultChars: string;
  contextWindowTokens: string;
  outputReserveTokens: string;
}

interface SettingsDraft {
  providers: ProviderDraft[];
  agents: AgentDraft[];
  searchBackend: "none" | "duckduckgo";
  searchMaxResults: string;
  execEnabled: boolean;
  execTimeoutMs: string;
  execMaxOutputChars: string;
}

const emptyDraft: SettingsDraft = {
  providers: [],
  agents: [],
  searchBackend: "none",
  searchMaxResults: "5",
  execEnabled: false,
  execTimeoutMs: "30000",
  execMaxOutputChars: "32000"
};

type SectionKey = "models" | "tools" | "system";

const NAV_ITEMS: { key: SectionKey; icon: typeof Cpu; label: string }[] = [
  { key: "models", icon: Cpu, label: "Models" },
  { key: "tools", icon: Wrench, label: "Tools" },
  { key: "system", icon: Monitor, label: "System" }
];

export default function SettingsView({ onClose }: SettingsViewProps) {
  const { config, tools, error, saving, refresh, save } = useConfig();
  const [draft, setDraft] = useState<SettingsDraft>(emptyDraft);
  const [saved, setSaved] = useState(false);
  const [validationError, setValidationError] = useState<string | undefined>();
  const [activeSection, setActiveSection] = useState<SectionKey>("models");
  const [expandedProvider, setExpandedProvider] = useState<string | null>(null);

  useEffect(() => {
    if (config) {
      setDraft(toDraft(config));
    }
  }, [config]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaved(false);
    setValidationError(undefined);

    let patch: Partial<Config>;
    try {
      patch = toConfigPatch(draft);
    } catch (cause) {
      setValidationError(cause instanceof Error ? cause.message : String(cause));
      return;
    }

    const ok = await save(patch);
    setSaved(ok);
  }

  const providerKeys = draft.providers.map((p) => p.key);

  function renderSection() {
    switch (activeSection) {
      case "models":
        return (
          <div className="space-y-6">
            {/* Agent Configuration */}
            <SettingsGroup title="Agent Configuration">
              {draft.agents.map((agent) => (
                <div key={agent.key} className="space-y-0">
                  <SettingsRow label="Agent" description={agent.key}>
                    <span className="text-[13px] font-mono text-ink-muted">{agent.key}</span>
                  </SettingsRow>
                  <SettingsRow label="Provider">
                    <select
                      className="h-8 w-44 rounded-lg border border-line/30 bg-surface px-2.5 text-[13px] outline-none transition-colors duration-fast hover:border-line-hover/50 focus-visible:border-accent/50 focus-visible:ring-2 focus-visible:ring-ring/30"
                      value={agent.provider}
                      onChange={(e) => {
                        const next = [...draft.agents];
                        next[0] = { ...agent, provider: e.target.value };
                        setDraft({ ...draft, agents: next });
                      }}
                    >
                      {providerKeys.map((key) => (
                        <option key={key} value={key}>{key}</option>
                      ))}
                    </select>
                  </SettingsRow>
                  <SettingsRow label="Model">
                    <AgentModelInput
                      agent={agent}
                      providers={draft.providers}
                      onChange={(a) => {
                        const next = [...draft.agents];
                        next[0] = a;
                        setDraft({ ...draft, agents: next });
                      }}
                    />
                  </SettingsRow>
                  <SettingsRow label="Thinking" description="Enable extended thinking">
                    <div className="flex items-center gap-3">
                      <Toggle
                        checked={agent.thinkingEnabled}
                        onChange={(v) => {
                          const next = [...draft.agents];
                          next[0] = { ...agent, thinkingEnabled: v };
                          setDraft({ ...draft, agents: next });
                        }}
                      />
                      <input
                        className="h-7 w-20 rounded-md border border-line/30 bg-surface px-2 text-[12px] font-mono outline-none transition-colors duration-fast focus:border-accent/50"
                        value={agent.thinkingBudget}
                        onChange={(e) => {
                          const next = [...draft.agents];
                          next[0] = { ...agent, thinkingBudget: e.target.value };
                          setDraft({ ...draft, agents: next });
                        }}
                        placeholder="16000"
                        inputMode="numeric"
                      />
                      <span className="text-[11px] text-ink-muted">tokens</span>
                    </div>
                  </SettingsRow>
                  <SettingsRow label="Effort" description="1 = auto, 4 = high">
                    <div className="flex gap-1">
                      {([1, 2, 3, 4] as const).map((level) => (
                        <button
                          key={level}
                          type="button"
                          onClick={() => {
                            const next = [...draft.agents];
                            next[0] = { ...agent, effort: String(level) };
                            setDraft({ ...draft, agents: next });
                          }}
                          className={`h-7 w-9 rounded-md text-[12px] font-medium transition-colors duration-fast ${
                            Number(agent.effort) === level
                              ? "bg-accent text-white"
                              : "bg-muted text-ink-muted hover:bg-muted-hover"
                          }`}
                        >
                          {level}
                        </button>
                      ))}
                    </div>
                  </SettingsRow>
                  <SettingsRow label="Max iterations">
                    <Input
                      className="w-24 font-mono text-[13px]"
                      value={agent.maxIterations}
                      onChange={(e) => {
                        const next = [...draft.agents];
                        next[0] = { ...agent, maxIterations: e.target.value };
                        setDraft({ ...draft, agents: next });
                      }}
                      inputMode="numeric"
                    />
                  </SettingsRow>
                  <SettingsRow label="Tool result chars">
                    <Input
                      className="w-24 font-mono text-[13px]"
                      value={agent.maxToolResultChars}
                      onChange={(e) => {
                        const next = [...draft.agents];
                        next[0] = { ...agent, maxToolResultChars: e.target.value };
                        setDraft({ ...draft, agents: next });
                      }}
                      inputMode="numeric"
                    />
                  </SettingsRow>
                  <SettingsRow label="Context window">
                    <Input
                      className="w-28 font-mono text-[13px]"
                      value={agent.contextWindowTokens}
                      onChange={(e) => {
                        const next = [...draft.agents];
                        next[0] = { ...agent, contextWindowTokens: e.target.value };
                        setDraft({ ...draft, agents: next });
                      }}
                      placeholder="auto"
                      inputMode="numeric"
                    />
                  </SettingsRow>
                  <SettingsRow label="Output reserve">
                    <Input
                      className="w-28 font-mono text-[13px]"
                      value={agent.outputReserveTokens}
                      onChange={(e) => {
                        const next = [...draft.agents];
                        next[0] = { ...agent, outputReserveTokens: e.target.value };
                        setDraft({ ...draft, agents: next });
                      }}
                      inputMode="numeric"
                    />
                  </SettingsRow>
                </div>
              ))}
            </SettingsGroup>

            {/* Providers */}
            <SettingsGroup
              title="Providers"
              action={
                <Button
                  variant="outline"
                  size="xs"
                  type="button"
                  onClick={() => {
                    const newKey = `provider-${draft.providers.length + 1}`;
                    setDraft({
                      ...draft,
                      providers: [...draft.providers, {
                        key: newKey,
                        type: "openai",
                        apiKey: "",
                        baseUrl: "",
                        timeoutMs: "60000",
                        models: "",
                        isNew: true
                      }]
                    });
                    setExpandedProvider(newKey);
                  }}
                  className="gap-1"
                >
                  <Plus size={13} />
                  Add
                </Button>
              }
            >
              {draft.providers.length === 0 ? (
                <div className="px-5 py-4 text-[13px] text-ink-muted">No providers configured.</div>
              ) : (
                draft.providers.map((provider, index) => (
                  <ProviderRow
                    key={provider.key}
                    provider={provider}
                    expanded={expandedProvider === provider.key}
                    onToggle={() =>
                      setExpandedProvider(expandedProvider === provider.key ? null : provider.key)
                    }
                    onChange={(p) => {
                      const next = [...draft.providers];
                      next[index] = p;
                      setDraft({ ...draft, providers: next });
                    }}
                    onRemove={() => {
                      setDraft({
                        ...draft,
                        providers: draft.providers.filter((_, i) => i !== index)
                      });
                      if (expandedProvider === provider.key) setExpandedProvider(null);
                    }}
                  />
                ))
              )}
            </SettingsGroup>
          </div>
        );

      case "tools":
        return (
          <div className="space-y-6">
            <SettingsGroup title="Search">
              <SettingsRow label="Backend" description="Web search provider">
                <select
                  className="h-8 w-36 rounded-lg border border-line/30 bg-surface px-2.5 text-[13px] outline-none transition-colors duration-fast hover:border-line-hover/50 focus-visible:border-accent/50 focus-visible:ring-2 focus-visible:ring-ring/30"
                  value={draft.searchBackend}
                  onChange={(event) =>
                    setDraftField(setDraft, "searchBackend", event.target.value as SettingsDraft["searchBackend"])
                  }
                >
                  <option value="none">none</option>
                  <option value="duckduckgo">duckduckgo</option>
                </select>
              </SettingsRow>
              <SettingsRow label="Max results" description="Results per search query">
                <Input
                  className="w-20 font-mono text-[13px]"
                  value={draft.searchMaxResults}
                  onChange={(event) => setDraftField(setDraft, "searchMaxResults", event.target.value)}
                  inputMode="numeric"
                />
              </SettingsRow>
            </SettingsGroup>

            <SettingsGroup title="Exec Tool">
              <SettingsRow label="Enable" description="Allow agent to run shell commands">
                <Toggle
                  checked={draft.execEnabled}
                  onChange={(v) => setDraftField(setDraft, "execEnabled", v)}
                />
              </SettingsRow>
              <SettingsRow label="Timeout (ms)" description="Max runtime per command">
                <Input
                  className="w-24 font-mono text-[13px]"
                  value={draft.execTimeoutMs}
                  onChange={(event) => setDraftField(setDraft, "execTimeoutMs", event.target.value)}
                  inputMode="numeric"
                />
              </SettingsRow>
              <SettingsRow label="Max output chars" description="Truncate output beyond this limit">
                <Input
                  className="w-24 font-mono text-[13px]"
                  value={draft.execMaxOutputChars}
                  onChange={(event) => setDraftField(setDraft, "execMaxOutputChars", event.target.value)}
                  inputMode="numeric"
                />
              </SettingsRow>
            </SettingsGroup>

            <SettingsGroup
              title="Available tools"
              action={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Refresh tools"
                  onClick={() => void refresh()}
                  type="button"
                  className="text-ink-muted hover:text-ink"
                >
                  <RefreshCw size={14} />
                </Button>
              }
            >
              <div className="px-5 py-3">
                {tools.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {tools.map((tool) => (
                      <span
                        key={tool.function.name}
                        className="rounded-lg bg-muted px-2.5 py-1 font-mono text-[12px] text-ink-secondary"
                      >
                        {tool.function.name}
                      </span>
                    ))}
                  </div>
                ) : (
                  <span className="text-[13px] text-ink-muted">No tools loaded.</span>
                )}
              </div>
            </SettingsGroup>
          </div>
        );

      case "system":
        return (
          <div className="space-y-6">
            <SettingsGroup title="Sessions">
              {config ? (
                <SettingsRow label="Directory" description="Read-only">
                  <span className="text-[13px] font-mono text-ink-muted">{config.sessions.dir}</span>
                </SettingsRow>
              ) : null}
            </SettingsGroup>
          </div>
        );
    }
  }

  return (
    <div className="flex h-full">
      {/* Desktop Sidebar */}
      <aside className="flex w-[180px] shrink-0 flex-col border-r border-line/20 bg-sidebar max-md:hidden">
        {/* Back button */}
        <div className="px-3 pt-3 pb-2">
          <Button
            variant="ghost"
            size="sm"
            type="button"
            onClick={onClose}
            className="w-full justify-start gap-2 text-[13px] text-ink-muted hover:text-ink"
          >
            <ChevronLeft size={15} />
            Back
          </Button>
        </div>

        {/* Nav items */}
        <nav className="flex-1 space-y-0.5 px-2">
          {NAV_ITEMS.map((item) => {
            const active = activeSection === item.key;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => setActiveSection(item.key)}
                className={`flex w-full items-center gap-2.5 rounded-[10px] px-3 py-2 text-[13px] font-medium transition-colors duration-fast ${
                  active
                    ? "bg-muted text-ink"
                    : "text-ink-muted hover:bg-muted/60 hover:text-ink"
                }`}
              >
                <item.icon size={15} />
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* Close at bottom */}
        <div className="px-3 pb-3 pt-2">
          <Button
            variant="ghost"
            size="sm"
            type="button"
            onClick={onClose}
            className="w-full justify-start gap-2 text-[13px] text-ink-muted hover:text-ink"
          >
            <X size={15} />
            Close
          </Button>
        </div>
      </aside>

      {/* Mobile nav: horizontal scroll pills */}
      <div className="hidden max-md:flex items-center gap-1.5 overflow-x-auto border-b border-line/20 bg-sidebar px-4 py-2">
        {NAV_ITEMS.map((item) => {
          const active = activeSection === item.key;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => setActiveSection(item.key)}
              className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-medium transition-colors duration-fast ${
                active
                  ? "bg-muted text-ink"
                  : "text-ink-muted hover:bg-muted/60 hover:text-ink"
              }`}
            >
              <item.icon size={13} />
              {item.label}
            </button>
          );
        })}
      </div>

      {/* Main Content */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Messages */}
        {error || validationError ? (
          <div className="mx-6 mt-4 rounded-xl bg-red-soft px-4 py-2.5 text-[13px] leading-relaxed text-red">
            {error ?? validationError}
          </div>
        ) : null}
        {saved ? (
          <div className="mx-6 mt-4 rounded-xl bg-green-soft px-4 py-2.5 text-[13px] leading-relaxed text-green">
            Saved.
          </div>
        ) : null}

        <form className="flex-1 overflow-y-auto px-6 py-5" onSubmit={handleSubmit}>
          {renderSection()}

          {/* Action bar */}
          <div className="sticky bottom-0 flex justify-end gap-2 border-t border-line/20 bg-background py-3 mt-6">
            <Button variant="outline" onClick={onClose} type="button">
              Close
            </Button>
            <Button disabled={saving || !config} type="submit">
              <Save size={14} />
              {saving ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ---- SettingsGroup ---- */

function SettingsGroup({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-line/20 bg-surface shadow-sm">
      <div className="flex items-center justify-between border-b border-line/15 px-5 py-3">
        <h2 className="text-[14px] font-semibold text-ink">{title}</h2>
        {action}
      </div>
      <div className="divide-y divide-line/10">{children}</div>
    </section>
  );
}

/* ---- SettingsRow ---- */

function SettingsRow({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-[48px] items-center justify-between gap-4 px-5 py-3">
      <div className="min-w-0">
        <span className="text-[13px] font-medium text-ink">{label}</span>
        {description ? (
          <>
            <br />
            <span className="text-[12px] text-ink-muted">{description}</span>
          </>
        ) : null}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

/* ---- Toggle ---- */

function Toggle({ checked, onChange }: { checked: boolean; onChange(v: boolean): void }) {
  return (
    <label className="relative inline-flex cursor-pointer items-center">
      <input
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        type="checkbox"
        className="peer sr-only"
      />
      <div className="h-5 w-9 rounded-full bg-muted transition-colors duration-fast peer-checked:bg-accent after:absolute after:start-[2px] after:top-[2px] after:h-4 after:w-4 after:rounded-full after:bg-white after:transition-transform after:duration-fast peer-checked:after:translate-x-full" />
    </label>
  );
}

/* ---- Agent Model Input with datalist ---- */

function AgentModelInput({
  agent,
  providers,
  onChange,
}: {
  agent: AgentDraft;
  providers: ProviderDraft[];
  onChange(a: AgentDraft): void;
}) {
  const selectedProvider = providers.find((p) => p.key === agent.provider);
  const modelSuggestions = selectedProvider?.models
    ? selectedProvider.models.split(",").map((s) => s.trim()).filter((s) => s.length > 0)
    : [];
  const listId = `models-${agent.key}`;

  return (
    <>
      <Input
        className="w-44 font-mono text-[13px]"
        value={agent.model}
        onChange={(e) => onChange({ ...agent, model: e.target.value })}
        placeholder="model name"
        list={modelSuggestions.length > 0 ? listId : undefined}
      />
      {modelSuggestions.length > 0 && (
        <datalist id={listId}>
          {modelSuggestions.map((m) => (
            <option key={m} value={m} />
          ))}
        </datalist>
      )}
    </>
  );
}

/* ---- Provider Row (expandable) ---- */

function ProviderRow({
  provider,
  expanded,
  onToggle,
  onChange,
  onRemove,
}: {
  provider: ProviderDraft;
  expanded: boolean;
  onToggle(): void;
  onChange(p: ProviderDraft): void;
  onRemove(): void;
}) {
  return (
    <div>
      {/* Collapsed header */}
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full min-h-[48px] items-center justify-between gap-3 px-5 py-3 text-left hover:bg-muted/30 transition-colors duration-fast"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="text-[13px] font-mono font-medium text-ink truncate">{provider.key}</span>
          <span className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-ink-muted">
            {provider.type}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onRemove(); }}
            className="rounded p-1 text-ink-muted hover:text-red transition-colors duration-fast"
          >
            <Trash2 size={13} />
          </button>
          <ChevronLeft
            size={14}
            className={`text-ink-muted transition-transform duration-fast ${expanded ? "-rotate-90" : "rotate-90"}`}
          />
        </div>
      </button>

      {/* Expanded editor */}
      {expanded && (
        <div className="border-t border-line/10 bg-muted/20 px-5 py-4 space-y-3">
          <div className="grid grid-cols-2 gap-3 max-sm:grid-cols-1">
            <SettingsRow label="Key">
              <input
                className="h-7 w-full max-w-[180px] rounded-md border border-line/30 bg-surface px-2 text-[13px] font-mono outline-none transition-colors duration-fast focus:border-accent/50"
                value={provider.key}
                onChange={(e) => onChange({ ...provider, key: e.target.value })}
                placeholder="provider key"
              />
            </SettingsRow>
            <SettingsRow label="Type">
              <select
                className="h-7 w-full max-w-[140px] rounded-md border border-line/30 bg-surface px-2 text-[13px] outline-none transition-colors duration-fast focus:border-accent/50"
                value={provider.type}
                onChange={(e) => onChange({ ...provider, type: e.target.value as ProviderDraft["type"] })}
              >
                <option value="openai">openai</option>
                <option value="anthropic">anthropic</option>
              </select>
            </SettingsRow>
          </div>
          <div className="grid grid-cols-2 gap-3 max-sm:grid-cols-1">
            <SettingsRow label="Base URL">
              <Input
                className="font-mono text-[13px]"
                value={provider.baseUrl}
                onChange={(e) => onChange({ ...provider, baseUrl: e.target.value })}
                placeholder={provider.type === "anthropic" ? "https://api.anthropic.com/v1" : "https://api.deepseek.com/v1"}
              />
            </SettingsRow>
            <SettingsRow label="Timeout (ms)">
              <Input
                className="font-mono text-[13px]"
                value={provider.timeoutMs}
                onChange={(e) => onChange({ ...provider, timeoutMs: e.target.value })}
                inputMode="numeric"
              />
            </SettingsRow>
          </div>
          <SettingsRow label="Models">
            <Input
              className="font-mono text-[13px]"
              value={provider.models}
              onChange={(e) => onChange({ ...provider, models: e.target.value })}
              placeholder="gpt-4o, gpt-4o-mini, deepseek-chat"
            />
          </SettingsRow>
          <SettingsRow label="API Key">
            <Input
              className="font-mono text-[13px]"
              value={provider.apiKey}
              onChange={(e) => onChange({ ...provider, apiKey: e.target.value })}
              placeholder="***"
            />
          </SettingsRow>
        </div>
      )}
    </div>
  );
}

/* ---- Data conversion ---- */

function toDraft(config: Config): SettingsDraft {
  return {
    providers: Object.entries(config.providers).map(([key, p]) => ({
      key,
      type: p.type,
      apiKey: p.apiKey ?? "",
      baseUrl: p.baseUrl ?? "",
      timeoutMs: numberToString(p.timeoutMs),
      models: (p.models ?? []).join(", ")
    })),
    agents: Object.entries(config.agents).map(([key, a]) => ({
      key,
      provider: a.provider,
      model: a.model,
      thinkingEnabled: a.thinking.enabled,
      thinkingBudget: numberToString(a.thinking.budgetTokens),
      effort: numberToString(a.effort),
      maxIterations: numberToString(a.maxIterations),
      maxToolResultChars: numberToString(a.maxToolResultChars),
      contextWindowTokens: numberToString(a.contextWindowTokens),
      outputReserveTokens: numberToString(a.outputReserveTokens ?? 4096)
    })),
    searchBackend: config.tools.search?.backend ?? "none",
    searchMaxResults: numberToString(config.tools.search?.maxResults ?? 5),
    execEnabled: config.tools.exec?.enabled ?? false,
    execTimeoutMs: numberToString(config.tools.exec?.timeoutMs ?? 30000),
    execMaxOutputChars: numberToString(config.tools.exec?.maxOutputChars ?? 32000)
  };
}

function toConfigPatch(draft: SettingsDraft): Partial<Config> {
  return {
    agents: Object.fromEntries(
      draft.agents.map((a) => [a.key, {
        provider: a.provider,
        model: a.model,
        thinking: {
          enabled: a.thinkingEnabled,
          budgetTokens: requiredNumber(a.thinkingBudget, "thinking budgetTokens")
        },
        effort: clampEffort(requiredNumber(a.effort, "effort")),
        maxIterations: requiredNumber(a.maxIterations, "maxIterations"),
        maxToolResultChars: requiredNumber(a.maxToolResultChars, "maxToolResultChars"),
        contextWindowTokens: optionalNumber(a.contextWindowTokens),
        outputReserveTokens: requiredNumber(a.outputReserveTokens, "outputReserveTokens"),
        params: {}
      }])
    ),
    providers: Object.fromEntries(
      draft.providers.map((p) => [p.key, {
        type: p.type,
        apiKey: optionalString(p.apiKey),
        baseUrl: optionalString(p.baseUrl),
        timeoutMs: optionalNumber(p.timeoutMs),
        models: optionalModels(p.models)
      }])
    ),
    tools: {
      search: {
        backend: draft.searchBackend,
        maxResults: requiredNumber(draft.searchMaxResults, "searchMaxResults")
      },
      exec: {
        enabled: draft.execEnabled,
        timeoutMs: requiredNumber(draft.execTimeoutMs, "execTimeoutMs"),
        maxOutputChars: requiredNumber(draft.execMaxOutputChars, "execMaxOutputChars")
      }
    }
  };
}

function clampEffort(n: number): 1 | 2 | 3 | 4 {
  if (n < 1) return 1;
  if (n > 4) return 4;
  return n as 1 | 2 | 3 | 4;
}

function setDraftField<K extends keyof SettingsDraft>(
  setDraft: (updater: (current: SettingsDraft) => SettingsDraft) => void,
  key: K,
  value: SettingsDraft[K]
) {
  setDraft((current) => ({ ...current, [key]: value }));
}

function numberToString(value: number | undefined): string {
  return value === undefined ? "" : String(value);
}

function optionalString(value: string): string | undefined {
  return value.trim() === "" ? undefined : value.trim();
}

function optionalModels(value: string): string[] | undefined {
  const models = value.split(",").map((s) => s.trim()).filter((s) => s.length > 0);
  return models.length > 0 ? models : undefined;
}

function optionalNumber(value: string): number | undefined {
  return value.trim() === "" ? undefined : requiredNumber(value, "value");
}

function requiredNumber(value: string, field: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${field} must be a positive integer`);
  }
  return parsed;
}
