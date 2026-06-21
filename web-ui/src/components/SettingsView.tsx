import { RefreshCw, Save, X } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";

import type { Config } from "../api/types";
import { useConfig } from "../hooks/useConfig";

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
    <div className="mx-auto min-h-[746px] w-full max-w-[700px] px-5 py-6">
      <div className="mb-5 flex items-start justify-between gap-4 border-b border-line pb-4">
        <div>
          <h1 className="m-0 text-lg font-bold text-ink">Settings</h1>
          <p className="mt-1 text-sm text-muted">Provider, limits, search, exec, and available tools.</p>
        </div>
        <button
          className="grid h-8 w-8 shrink-0 place-items-center rounded-ui border border-line bg-white text-text"
          onClick={onClose}
          type="button"
          aria-label="Close settings"
        >
          <X size={15} />
        </button>
      </div>

      {error || validationError ? (
        <div className="mb-4 rounded-ui bg-red/10 p-3 text-sm text-red">{error ?? validationError}</div>
      ) : null}
      {saved ? <div className="mb-4 rounded-ui bg-green/10 p-3 text-sm text-green">Saved.</div> : null}

      <form className="grid gap-4" onSubmit={handleSubmit}>
        <section className="rounded-ui bg-white p-4 shadow-[inset_0_0_0_1px_#e1e5e2]">
          <h2 className="mb-3 text-sm font-bold text-ink">Provider</h2>
          <div className="grid gap-3">
            <label className="grid gap-1.5 text-xs font-bold uppercase text-muted">
              Name
              <input
                className="rounded-ui border border-line px-3 py-2 font-normal normal-case text-text"
                value={draft.providerName}
                onChange={(event) => setDraftField(setDraft, "providerName", event.target.value)}
                placeholder="deepseek"
              />
            </label>
            <label className="grid gap-1.5 text-xs font-bold uppercase text-muted">
              Base URL
              <input
                className="rounded-ui border border-line px-3 py-2 font-mono text-xs font-normal normal-case text-text"
                value={draft.baseUrl}
                onChange={(event) => setDraftField(setDraft, "baseUrl", event.target.value)}
                placeholder="https://api.deepseek.com/v1"
              />
            </label>
            <div className="grid grid-cols-2 gap-3 max-sm:grid-cols-1">
              <label className="grid gap-1.5 text-xs font-bold uppercase text-muted">
                Model
                <input
                  className="rounded-ui border border-line px-3 py-2 font-normal normal-case text-text"
                  value={draft.model}
                  onChange={(event) => setDraftField(setDraft, "model", event.target.value)}
                  placeholder="deepseek-chat"
                />
              </label>
              <label className="grid gap-1.5 text-xs font-bold uppercase text-muted">
                Timeout
                <input
                  className="rounded-ui border border-line px-3 py-2 font-mono text-xs font-normal normal-case text-text"
                  value={draft.timeoutMs}
                  onChange={(event) => setDraftField(setDraft, "timeoutMs", event.target.value)}
                  placeholder="60000"
                  inputMode="numeric"
                />
              </label>
            </div>
            <label className="grid gap-1.5 text-xs font-bold uppercase text-muted">
              API key
              <input
                className="rounded-ui border border-line px-3 py-2 font-mono text-xs font-normal normal-case text-text"
                value={draft.apiKey}
                onChange={(event) => setDraftField(setDraft, "apiKey", event.target.value)}
                placeholder="***"
              />
            </label>
          </div>
        </section>

        <section className="rounded-ui bg-white p-4 shadow-[inset_0_0_0_1px_#e1e5e2]">
          <h2 className="mb-3 text-sm font-bold text-ink">Agent</h2>
          <div className="grid grid-cols-3 gap-3 max-sm:grid-cols-1">
            <label className="grid gap-1.5 text-xs font-bold uppercase text-muted">
              Iterations
              <input
                className="rounded-ui border border-line px-3 py-2 font-mono text-xs font-normal normal-case text-text"
                value={draft.maxIterations}
                onChange={(event) => setDraftField(setDraft, "maxIterations", event.target.value)}
                inputMode="numeric"
              />
            </label>
            <label className="grid gap-1.5 text-xs font-bold uppercase text-muted">
              Tool chars
              <input
                className="rounded-ui border border-line px-3 py-2 font-mono text-xs font-normal normal-case text-text"
                value={draft.maxToolResultChars}
                onChange={(event) => setDraftField(setDraft, "maxToolResultChars", event.target.value)}
                inputMode="numeric"
              />
            </label>
            <label className="grid gap-1.5 text-xs font-bold uppercase text-muted">
              Context
              <input
                className="rounded-ui border border-line px-3 py-2 font-mono text-xs font-normal normal-case text-text"
                value={draft.contextWindowTokens}
                onChange={(event) => setDraftField(setDraft, "contextWindowTokens", event.target.value)}
                placeholder="auto"
                inputMode="numeric"
              />
            </label>
          </div>
        </section>

        <section className="rounded-ui bg-white p-4 shadow-[inset_0_0_0_1px_#e1e5e2]">
          <h2 className="mb-3 text-sm font-bold text-ink">Tools</h2>
          <div className="grid grid-cols-2 gap-3 max-sm:grid-cols-1">
            <label className="grid gap-1.5 text-xs font-bold uppercase text-muted">
              Search
              <select
                className="rounded-ui border border-line bg-white px-3 py-2 font-normal normal-case text-text"
                value={draft.searchBackend}
                onChange={(event) => setDraftField(setDraft, "searchBackend", event.target.value as SettingsDraft["searchBackend"])}
              >
                <option value="none">none</option>
                <option value="duckduckgo">duckduckgo</option>
              </select>
            </label>
            <label className="grid gap-1.5 text-xs font-bold uppercase text-muted">
              Search results
              <input
                className="rounded-ui border border-line px-3 py-2 font-mono text-xs font-normal normal-case text-text"
                value={draft.searchMaxResults}
                onChange={(event) => setDraftField(setDraft, "searchMaxResults", event.target.value)}
                inputMode="numeric"
              />
            </label>
          </div>
          <label className="mt-4 flex items-center gap-2 text-sm text-text">
            <input
              checked={draft.execEnabled}
              onChange={(event) => setDraftField(setDraft, "execEnabled", event.target.checked)}
              type="checkbox"
            />
            Enable exec tool
          </label>
          <div className="mt-3 grid grid-cols-2 gap-3 max-sm:grid-cols-1">
            <label className="grid gap-1.5 text-xs font-bold uppercase text-muted">
              Exec timeout
              <input
                className="rounded-ui border border-line px-3 py-2 font-mono text-xs font-normal normal-case text-text"
                value={draft.execTimeoutMs}
                onChange={(event) => setDraftField(setDraft, "execTimeoutMs", event.target.value)}
                inputMode="numeric"
              />
            </label>
            <label className="grid gap-1.5 text-xs font-bold uppercase text-muted">
              Exec output
              <input
                className="rounded-ui border border-line px-3 py-2 font-mono text-xs font-normal normal-case text-text"
                value={draft.execMaxOutputChars}
                onChange={(event) => setDraftField(setDraft, "execMaxOutputChars", event.target.value)}
                inputMode="numeric"
              />
            </label>
          </div>
        </section>

        <section className="rounded-ui bg-white p-4 shadow-[inset_0_0_0_1px_#e1e5e2]">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-sm font-bold text-ink">Available tools</h2>
            <button
              className="grid h-7 w-7 place-items-center rounded-ui border border-line bg-white text-text"
              onClick={() => void refresh()}
              type="button"
              aria-label="Refresh tools"
            >
              <RefreshCw size={13} />
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {tools.length > 0 ? (
              tools.map((tool) => (
                <span key={tool.function.name} className="rounded-[7px] bg-[#f4f6f4] px-2 py-1 font-mono text-xs text-muted">
                  {tool.function.name}
                </span>
              ))
            ) : (
              <span className="text-sm text-muted">No tools loaded.</span>
            )}
          </div>
        </section>

        <div className="sticky bottom-0 flex justify-end gap-2 border-t border-line bg-surface py-3">
          <button
            className="rounded-ui border border-line bg-white px-3 py-2 text-sm text-text"
            onClick={onClose}
            type="button"
          >
            Close
          </button>
          <button
            className="inline-flex items-center gap-2 rounded-ui bg-ink px-3 py-2 text-sm text-white disabled:opacity-60"
            disabled={saving || !config}
            type="submit"
          >
            <Save size={14} />
            {saving ? "Saving" : "Save changes"}
          </button>
        </div>
      </form>
    </div>
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
