import { RefreshCw, Save, X } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";

import type { Config } from "../api/types";
import { useConfig } from "../hooks/useConfig";
import { Button } from "./ui/button";
import { Input } from "./ui/input";

interface SettingsViewProps {
  onClose(): void;
}

interface SettingsDraft {
  providerName: string;
  apiKey: string;
  baseUrl: string;
  model: string;
  timeoutMs: string;
  maxIterations: string;
  maxToolResultChars: string;
  contextWindowTokens: string;
  searchBackend: "none" | "duckduckgo";
  searchMaxResults: string;
  execEnabled: boolean;
  execTimeoutMs: string;
  execMaxOutputChars: string;
}

const emptyDraft: SettingsDraft = {
  providerName: "",
  apiKey: "",
  baseUrl: "",
  model: "",
  timeoutMs: "",
  maxIterations: "",
  maxToolResultChars: "",
  contextWindowTokens: "",
  searchBackend: "none",
  searchMaxResults: "5",
  execEnabled: false,
  execTimeoutMs: "30000",
  execMaxOutputChars: "32000"
};

export default function SettingsView({ onClose }: SettingsViewProps) {
  const { config, tools, error, saving, refresh, save } = useConfig();
  const [draft, setDraft] = useState<SettingsDraft>(emptyDraft);
  const [saved, setSaved] = useState(false);
  const [validationError, setValidationError] = useState<string | undefined>();

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

  return (
    <div className="mx-auto h-full w-full max-w-[680px] overflow-y-auto px-5 py-6">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between gap-4 border-b border-line/20 pb-4">
        <div>
          <h1 className="text-lg font-semibold text-ink">Settings</h1>
          <p className="mt-1 text-[13px] text-ink-muted leading-relaxed">
            Provider, limits, search, exec, and available tools.
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Close settings"
          onClick={onClose}
          type="button"
          className="text-ink-muted hover:text-ink"
        >
          <X size={16} />
        </Button>
      </div>

      {/* Messages */}
      {error || validationError ? (
        <div className="mb-4 rounded-xl bg-red-soft px-4 py-2.5 text-[13px] leading-relaxed text-red">
          {error ?? validationError}
        </div>
      ) : null}
      {saved ? (
        <div className="mb-4 rounded-xl bg-green-soft px-4 py-2.5 text-[13px] leading-relaxed text-green">
          Saved.
        </div>
      ) : null}

      <form className="space-y-5" onSubmit={handleSubmit}>
        <Section title="Provider">
          <Field label="Name">
            <Input
              value={draft.providerName}
              onChange={(event) => setDraftField(setDraft, "providerName", event.target.value)}
              placeholder="deepseek"
            />
          </Field>
          <Field label="Base URL">
            <Input
              className="font-mono text-[13px]"
              value={draft.baseUrl}
              onChange={(event) => setDraftField(setDraft, "baseUrl", event.target.value)}
              placeholder="https://api.deepseek.com/v1"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3 max-sm:grid-cols-1">
            <Field label="Model">
              <Input
                value={draft.model}
                onChange={(event) => setDraftField(setDraft, "model", event.target.value)}
                placeholder="deepseek-chat"
              />
            </Field>
            <Field label="Timeout (ms)">
              <Input
                className="font-mono text-[13px]"
                value={draft.timeoutMs}
                onChange={(event) => setDraftField(setDraft, "timeoutMs", event.target.value)}
                placeholder="60000"
                inputMode="numeric"
              />
            </Field>
          </div>
          <Field label="API key">
            <Input
              className="font-mono text-[13px]"
              value={draft.apiKey}
              onChange={(event) => setDraftField(setDraft, "apiKey", event.target.value)}
              placeholder="***"
            />
          </Field>
        </Section>

        <Section title="Agent">
          <div className="grid grid-cols-3 gap-3 max-sm:grid-cols-1">
            <Field label="Max iterations">
              <Input
                className="font-mono text-[13px]"
                value={draft.maxIterations}
                onChange={(event) => setDraftField(setDraft, "maxIterations", event.target.value)}
                inputMode="numeric"
              />
            </Field>
            <Field label="Tool result chars">
              <Input
                className="font-mono text-[13px]"
                value={draft.maxToolResultChars}
                onChange={(event) => setDraftField(setDraft, "maxToolResultChars", event.target.value)}
                inputMode="numeric"
              />
            </Field>
            <Field label="Context window">
              <Input
                className="font-mono text-[13px]"
                value={draft.contextWindowTokens}
                onChange={(event) => setDraftField(setDraft, "contextWindowTokens", event.target.value)}
                placeholder="auto"
                inputMode="numeric"
              />
            </Field>
          </div>
        </Section>

        <Section title="Tools">
          <div className="grid grid-cols-2 gap-3 max-sm:grid-cols-1">
            <Field label="Search backend">
              <select
                className="h-8 w-full rounded-lg border border-line/30 bg-surface px-2.5 text-[13px] outline-none transition-colors duration-fast hover:border-line-hover/50 focus-visible:border-accent/50 focus-visible:ring-2 focus-visible:ring-ring/30"
                value={draft.searchBackend}
                onChange={(event) =>
                  setDraftField(setDraft, "searchBackend", event.target.value as SettingsDraft["searchBackend"])
                }
              >
                <option value="none">none</option>
                <option value="duckduckgo">duckduckgo</option>
              </select>
            </Field>
            <Field label="Search results">
              <Input
                className="font-mono text-[13px]"
                value={draft.searchMaxResults}
                onChange={(event) => setDraftField(setDraft, "searchMaxResults", event.target.value)}
                inputMode="numeric"
              />
            </Field>
          </div>
          <label className="mt-4 flex cursor-pointer items-center gap-2.5 text-[13px] text-ink">
            <input
              checked={draft.execEnabled}
              onChange={(event) => setDraftField(setDraft, "execEnabled", event.target.checked)}
              type="checkbox"
              className="h-4 w-4 rounded border-line text-accent accent-accent"
            />
            Enable exec tool
          </label>
          <div className="mt-3 grid grid-cols-2 gap-3 max-sm:grid-cols-1">
            <Field label="Exec timeout (ms)">
              <Input
                className="font-mono text-[13px]"
                value={draft.execTimeoutMs}
                onChange={(event) => setDraftField(setDraft, "execTimeoutMs", event.target.value)}
                inputMode="numeric"
              />
            </Field>
            <Field label="Exec output chars">
              <Input
                className="font-mono text-[13px]"
                value={draft.execMaxOutputChars}
                onChange={(event) => setDraftField(setDraft, "execMaxOutputChars", event.target.value)}
                inputMode="numeric"
              />
            </Field>
          </div>
        </Section>

        <Section title="Available tools">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-[14px] font-semibold text-ink">Available tools</h2>
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
          </div>
          <div className="flex flex-wrap gap-1.5">
            {tools.length > 0 ? (
              tools.map((tool) => (
                <span
                  key={tool.function.name}
                  className="rounded-lg bg-muted px-2.5 py-1 font-mono text-[12px] text-ink-secondary"
                >
                  {tool.function.name}
                </span>
              ))
            ) : (
              <span className="text-[13px] text-ink-muted">No tools loaded.</span>
            )}
          </div>
        </Section>

        {/* Action bar */}
        <div className="sticky bottom-0 flex justify-end gap-2 border-t border-line/20 bg-background py-3 -mx-5 px-5">
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
  );
}

/* ---- Helpers ---- */

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-line/20 bg-surface p-5">
      <h2 className="mb-3 text-[14px] font-semibold text-ink">{title}</h2>
      <div className="grid gap-3">{children}</div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-1.5">
      <span className="text-[12px] font-medium text-ink-muted">{label}</span>
      {children}
    </label>
  );
}

function toDraft(config: Config): SettingsDraft {
  return {
    providerName: config.provider.name ?? "",
    apiKey: config.provider.apiKey ?? "",
    baseUrl: config.provider.baseUrl ?? "",
    model: config.provider.model ?? "",
    timeoutMs: numberToString(config.provider.timeoutMs),
    maxIterations: numberToString(config.agent.maxIterations),
    maxToolResultChars: numberToString(config.agent.maxToolResultChars),
    contextWindowTokens: numberToString(config.agent.contextWindowTokens),
    searchBackend: config.search?.backend ?? "none",
    searchMaxResults: numberToString(config.search?.maxResults ?? 5),
    execEnabled: config.exec?.enabled ?? false,
    execTimeoutMs: numberToString(config.exec?.timeoutMs ?? 30000),
    execMaxOutputChars: numberToString(config.exec?.maxOutputChars ?? 32000)
  };
}

function toConfigPatch(draft: SettingsDraft): Partial<Config> {
  return {
    provider: {
      name: optionalString(draft.providerName),
      apiKey: optionalString(draft.apiKey),
      baseUrl: optionalString(draft.baseUrl),
      model: optionalString(draft.model),
      timeoutMs: optionalNumber(draft.timeoutMs)
    },
    agent: {
      maxIterations: requiredNumber(draft.maxIterations, "maxIterations"),
      maxToolResultChars: requiredNumber(draft.maxToolResultChars, "maxToolResultChars"),
      contextWindowTokens: optionalNumber(draft.contextWindowTokens)
    },
    search: {
      backend: draft.searchBackend,
      maxResults: requiredNumber(draft.searchMaxResults, "searchMaxResults")
    },
    exec: {
      enabled: draft.execEnabled,
      timeoutMs: requiredNumber(draft.execTimeoutMs, "execTimeoutMs"),
      maxOutputChars: requiredNumber(draft.execMaxOutputChars, "execMaxOutputChars")
    }
  };
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
