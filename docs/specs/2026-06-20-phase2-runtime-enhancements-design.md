# Phase 2 — Runtime Enhancements Design

Status: implementation reference (autonomous goal-driven build; not gated on approval).
Branch: `worktree-phase2-opus-4.8` (model: Claude Opus 4.8).
Scope source: `docs/ROADMAP.md` → Phase 2.

## Goals

Deliver the eight Phase 2 items as small, well-bounded units that respect existing
architecture boundaries (AgentLoop is the sole coordinator; Provider never executes
tools; tools never know about providers or sessions). Every unit ships with focused
tests. `npm test`, `npm run typecheck`, `npm run build` must stay green.

## Implementation order

1. Baseline fix (align `context-builder` test to current `identity.md` wording).
2. Config & schema validation (zod) — independent foundation.
3. Accurate context accounting (token counter + expose usage).
4. Abort / cancel (AbortSignal end-to-end).
5. Streaming + Agent event API (the core coupled block).
6. Real web search, Shell exec, Apply patch (independent tools).
7. Docs + roadmap update + final verification.

## Feature designs

### Config & schema validation (`src/config/schema.ts`)

- Define a zod schema mirroring `Config`. `loadConfig` parses the merged object and
  throws a readable aggregated message on failure (path + reason).
- `ensureDefaultConfig` unchanged behavior; generated default still validates.
- Surface missing/invalid `apiKey` early: `AgentLoop.run` throws a clear actionable
  error before constructing the provider when no key is configured (env or config).
- Do NOT replace hand-rolled `src/tools/schema.ts` with zod (deliberately deferred:
  large blast radius, current validator works and returns model-friendly errors).

### Accurate context accounting (`src/agent/tokens.ts`)

- `TokenCounter` interface: `count(text): number`, `countMessages(messages): number`.
- Default `HeuristicTokenCounter`: improved char/word blend over naive `length/4`
  (counts whitespace-separated words + punctuation, ~3.6 chars/token baseline).
  No new dependency — DeepSeek's tokenizer differs from GPT's, so a wrong vendor
  tokenizer would give false precision. Counter is pluggable for future swap.
- `AgentRunner` uses the counter for budget trimming (replaces inline `length/4`).
- `AgentRunResult.usage` already accumulates real provider usage; `RunResult` gains
  a `usage: Record<string, number>` field so `AgentLoop` stops dropping it.
- Compaction keeps a one-line summary instead of fully omitting tool results.

### Abort / cancel

- `ChatRequest.signal?: AbortSignal` — `OpenAIProvider` forwards it to fetch,
  composed with its internal timeout controller (abort if either fires).
- `AgentRunSpec.signal?: AbortSignal` — runner checks at loop top and after each
  provider call; on abort returns `stopReason: "aborted"` with partial messages.
- `AgentLoop.run` accepts `RunOptions.signal`; threads to runner and provider.
- Graceful: no throw on user abort; abort surfaces as a normal terminal result.

### Streaming + Agent event API (`src/agent/events.ts`)

- `AgentEvent` discriminated union: `token` | `tool_call` | `tool_result` |
  `done` | `error`.
- `LLMProvider.chatStream?(request): AsyncIterable<ProviderStreamEvent>` — optional.
  `ProviderStreamEvent`: `{type:"delta", content}` | `{type:"tool_calls", toolCalls}`
  | `{type:"done", response}`. OpenAIProvider parses SSE (`data:` lines, `[DONE]`),
  accumulates tool-call fragments by index, emits content deltas live.
- `AgentRunner.runStream(spec): AsyncIterable<AgentEvent>` — same loop logic; uses
  `chatStream` when available, else falls back to wrapping `chat()`. Emits `token`
  during streaming, `tool_call`/`tool_result` around execution, terminal `done`.
- `Agent.stream?(input, options): AsyncIterable<AgentEvent>` on `AgentLoop`.
  Existing `run()` stays byte-for-byte compatible (no signature change beyond the
  optional `signal`); session save behavior preserved for both paths.

### Real web search (`src/tools/search.ts` / config)

- `web_search` calls DuckDuckGo HTML endpoint (`https://html.duckduckgo.com/html/`,
  no API key). Parses result anchors + snippets, returns top N as text.
- Config: `provider`-independent `search` block `{ backend: "duckduckgo"|"none",
  maxResults }`. Backend injected into tool factory; `"none"` keeps the old error.
- Error handling: network failure / non-2xx returns a model-friendly error string,
  never throws. Basic result cap (maxResults) bounds output.

### Shell exec (`src/tools/exec.ts`)

- `exec` tool: runs a command via `spawn` with `cwd` pinned to workspace, a timeout
  (kill on expiry), and combined stdout/stderr capture truncated to a char budget.
- Deny list: refuse obvious destructive patterns (`rm -rf /`, fork bombs, `mkfs`,
  `dd of=/dev`, shutdown/reboot) before spawning.
- Approval: `ToolExecutionContext.approveCommand?(cmd): Promise<boolean>` — when
  present and it returns false, the tool refuses. Delegates confirmation to caller
  (CLI/Web UI). Absent ⇒ allowed (non-denylisted only). Not registered by default
  unless enabled, but exported so callers opt in.

### Apply patch (`src/tools/patch.ts`)

- `apply_patch` tool: accepts unified-diff text. Parses `@@` hunks, matches context
  lines against the current file (exact, then whitespace-trim fallback, then small
  offset search), applies additions/removals. `dryRun` returns the would-be result
  without writing. Workspace-path-safe. Errors (no match) returned as text.

## Testing

Each feature gets focused unit tests mirroring existing patterns (scripted provider,
tmp workspaces, fake fetch). New runner streaming path tested with a scripted
streaming provider and a non-streaming fallback provider. Abort tested by aborting
mid-run. No live network in tests (fetch is injected).

## Out of scope (deferred to later phases)

- zod-based tool parameter schemas, MCP, multi-provider, subagents (Phase 4).
- Web UI server/frontend (Phase 3).

