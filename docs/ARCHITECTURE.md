# Architecture

mini-agent is a TypeScript agent runtime organized into focused, single-responsibility modules. Communication flows in one direction through well-defined interfaces.

## Module Map

```text
CLI / REPL            Web UI Backend
    │
    ▼
AgentLoop ──▶ ContextBuilder ──▶ prompts/ (identity, tool contract, skills)
    │
    ▼
AgentRunner ──▶ Provider (LLM backend)
    │               │
    │               ▼
    │           tool calls detected
    │               │
    ▼               ▼
ToolRegistry ◀── tool execution
    │
    ▼
SkillsLoader ◀── workspace/skills/
    │
    ▼
SessionManager ──▶ .mini-agent/workspace/sessions/
```

## Modules

### CLI / REPL (`src/cli.ts`)

The application entry point and the only thing that talks to a human. `runCli`:

1. **Parse args** — `--workspace`, `--session`, `--resume`, `--stream`.
2. **Load config** — `ensureDefaultConfig`; a `ConfigValidationError` is caught and printed as a clean `Config error:` message (no stack trace) before exiting.
3. **Wire one agent** — builds the `OpenAIProvider`, a config-driven `ToolRegistry` (search backend, opt-in exec), and a single `AgentLoop`.
4. **Run the loop** — reads lines from a readline interface (TTY or piped). Plain input is sent to the agent via `run()` or, with `--stream`, `stream()` (printing tokens live); a terminal `usage>` line reports token usage.

Commands are dispatched before reaching the agent:

- `/help` — list commands
- `/tools` — print the registered tools (reflects config)
- `/tool <name> <json>` — execute one tool directly through the registry, with no model call (a deterministic verification/debug entry point)
- `/exit`, `/quit` — leave

`Ctrl-C` aborts the in-flight turn through a per-turn `AbortController` whose signal is threaded into `run`/`stream`; pressing it while idle exits.

Boundary: the CLI is a thin driver. It never coordinates subsystems itself — that is AgentLoop's job — and depends only on `AgentLoop.run`/`stream` and the `ToolRegistry` interface. The `/tool` command deliberately bypasses the agent loop to exercise a tool in isolation; it is a verification aid, not a runtime path.

### Web UI Backend (`src/server/`, `src/server.ts`)

The Web UI backend is a second thin driver beside the CLI. It starts a native Node `http.Server`, handles WebSocket upgrades, and translates browser protocol messages into `AgentLoop.stream()` calls. It does not parse prompts, execute tools directly, or reach into runtime internals.

Entry points:

- `createServer(options)` — builds an HTTP server with REST routes, WebSocket upgrade handling, and static file serving.
- `startServer(options)` — creates and listens in one call.
- `src/server.ts` — executable wrapper (`node dist/server.js --workspace <dir> --host 127.0.0.1 --port 3210`).

REST routes:

| Method | Path | Handler |
|---|---|---|
| `GET` | `/api/sessions` | `SessionManager.listSessions()` |
| `GET` | `/api/sessions/:key` | `SessionManager.getOrCreate()` |
| `DELETE` | `/api/sessions/:key` | `SessionManager.deleteSession()` |
| `GET` | `/api/config` | redacted in-memory config |
| `PUT` | `/api/config` | `writeConfig()` + in-memory version bump |
| `GET` | `/api/tools` | configured `ToolRegistry.getDefinitions()` |
| `GET` | `/api/files/tree?path=` | read-only workspace-contained file tree |
| `GET` | `/api/files/content?path=` | read-only workspace-contained file content |

The WebSocket endpoint is `/ws?session=<key>`. Each connection owns one session view, one `AgentLoop`, and one per-connection `ToolRegistry`. Incoming `user_message` starts a streamed turn; `abort` cancels the in-flight turn; `approve_command` resolves a pending exec approval request. A second `user_message` while a turn is active returns `turn_rejected`.

Config is global per server instance. `PUT /api/config` writes `.mini-agent/config.json` atomically and bumps an in-memory version. Connections compare that version before the next turn and rebuild their `AgentLoop` when needed; active turns are not interrupted.

Security invariants:

- File APIs use the same workspace-prefix path containment rule as file tools.
- `GET /api/config` never returns plaintext API keys; `PUT /api/config` preserves the stored key when the client sends the redaction sentinel `***`.

### AgentLoop (`src/agent/AgentLoop.ts`)

The top-level coordinator. Creates and wires all dependencies, then executes the turn lifecycle:

1. **Restore** — load or create session via SessionManager
2. **Build** — construct messages via ContextBuilder (system prompt + history + user input)
3. **Run** — execute the tool-calling loop via AgentRunner
4. **Save** — persist user, assistant, and tool messages to session
5. **Respond** — return final content and metadata

AgentLoop is the sole wiring/coordination layer — it constructs and connects every subsystem. Other modules depend only on the narrow interfaces they are handed.

### AgentRunner (`src/agent/AgentRunner.ts`)

The core execution engine. Takes a spec (`AgentRunSpec`) and runs the LLM + tool-calling iteration loop. A single internal `execute(spec, streaming)` generator backs two public entry points:

- `run(spec)` — consumes the loop with streaming disabled (always `provider.chat`), so its behavior and the provider contract are unchanged. Returns `AgentRunResult`.
- `runStream(spec)` — prefers `provider.chatStream` and yields `AgentEvent`s (`token`, `tool_call`, `tool_result`, `error`, and a single terminal `done` carrying the full result).

```
for iteration up to maxIterations:
    if signal aborted → done(aborted)
    call provider.chat / chatStream (forward AbortSignal)
    if tool calls returned:
        push assistant message with tool_calls
        execute each tool → push tool result messages (emit tool_call/tool_result)
        continue loop
    else:
        push final assistant message → done
```

Built-in resilience:

- **Empty response retry** — if the model returns blank content, inject a continue prompt once
- **Truncated tool call recovery** — if the response is cut mid-tool-call, request reissue once
- **Orphan tool result cleanup** — remove tool messages whose parent assistant message was dropped
- **Missing tool result backfill** — insert synthetic results for tool calls that lost their output
- **Tool result compaction** — replace old large tool results with a one-line summary
- **Context budget trimming** — drop oldest messages using a pluggable `TokenCounter` (`src/agent/tokens.ts`) when the estimated token count exceeds the limit
- **Cooperative abort** — an `AbortSignal` on the spec exits the loop cleanly with `stopReason: "aborted"`

### Events & streaming (`src/agent/events.ts`)

`AgentEvent` is the discriminated union surfaced by `runStream` / `AgentLoop.stream`: `token`, `tool_call`, `tool_result`, `done`, `error`. Providers expose streaming through an optional `chatStream(): AsyncIterable<ProviderStreamEvent>`; the runner falls back to `chat()` when it is absent, so streaming is purely additive.

### Provider (`src/providers/`)

Abstracts the LLM backend behind a single interface:

```ts
interface LLMProvider {
  defaultModel(): string;
  chat(request: ChatRequest): Promise<LLMResponse>;
  chatStream?(request: ChatRequest): AsyncIterable<ProviderStreamEvent>;
}
```

Implemented by `OpenAIProvider` — works with any OpenAI-compatible API (DeepSeek, OpenAI, etc.). It parses Server-Sent Events for `chatStream`, accumulating fragmented tool calls by index, and shares one request path with `chat` that composes the caller's `AbortSignal` with an internal timeout.

Key design rule: Provider returns tool call requests, it never executes them.

### Tool System (`src/tools/`)

Three layers:

1. **Tool interface** — name, description, JSON Schema parameters, execute function
2. **ToolRegistry** — register → getDefinitions → prepareCall → execute
3. **Built-in tools** — read_file, write_file, list_dir, find_files, grep, web_fetch, web_search, apply_patch, and (opt-in) exec

`createDefaultToolRegistry(options)` assembles the set. `web_search` uses a DuckDuckGo backend when `search.backend` is configured (default `none`). `apply_patch` applies unified diffs with fuzzy hunk matching and a dry-run mode. `exec` runs shell commands and is **off by default**: it is only registered when `exec.enabled` is true, refuses a deny list of destructive commands, pins `cwd` to the workspace, enforces a timeout, and consults an optional `approveCommand` gate on the execution context.

Schema validation happens at `prepareCall`: arguments are cast to their declared types, then validated against the JSON Schema. Validation errors are returned to the model as tool results — the runtime never crashes on bad arguments.

Workspace safety: `resolveWorkspacePath()` prevents path traversal with `..` checks and blocks dangerous device paths (`/dev`, `/proc`, `/sys`). The `web_fetch` tool adds network safety: it allows only `http`/`https` URLs and refuses local-network hosts (`localhost`, `127.0.0.1`, `::1`) to limit SSRF.

### Session (`src/session/`)

JSONL-based persistence with atomic writes:

- Sessions stored as `.mini-agent/workspace/sessions/{key}.jsonl`
- Atomic write via temp file + rename
- History trimming by message count and character budget
- Drops leading tool messages so trimmed history never starts with an orphan tool result
- Corrupted JSONL lines are silently skipped on load
- Session listing returns `{ key, createdAt, updatedAt, messageCount, preview }[]`
- Session deletion removes the JSONL file and clears the in-memory cache entry

### ContextBuilder (`src/agent/ContextBuilder.ts`)

Assembles the system prompt and messages for each turn:

**System prompt components:**
1. Identity template (`src/prompts/identity.md`)
2. Workspace bootstrap files (`AGENTS.md`, `SOUL.md`, `USER.md`)
3. Tool contract (`src/prompts/tool_contract.md`)
4. Skills summary (from SkillsLoader)

**User message components:**
1. User input text
2. Runtime context metadata (timestamp, workspace path, session key)

Adjacent same-role messages are merged to prevent invalid role sequences.

### Skills (`src/skills/SkillsLoader.ts`)

Discovers skills from `workspace/skills/{name}/SKILL.md`:

- Parses YAML frontmatter for name, description, and `always` flag
- Generates a summary injected into the system prompt
- Can load full skill content on demand via `read_file`

### Config (`src/config/`)

Loads, merges, and validates configuration:

- `defaultConfig()` — hardcoded defaults (the source of concrete values like the provider name and base URL)
- `loadConfig()` — reads `.mini-agent/config.json`, deep-merges over the defaults, then validates the result against a zod schema (`src/config/schema.ts`), reporting all issues with dotted paths and rejecting unknown keys
- `ensureDefaultConfig()` — auto-creates the config file on first run
- `writeConfig()` — writes validated provider/agent/search/exec config patches atomically and preserves stored API keys when a UI round-trip sends `***`
- Optional `search` and `exec` blocks configure the web search backend and the opt-in exec tool

A missing API key is surfaced early by `AgentLoop` (from config or `MINI_AGENT_API_KEY`) instead of failing at the first request. Token accounting uses a pluggable `TokenCounter` (`src/agent/tokens.ts`); real provider `usage` flows through `RunResult`.

### Hooks (`src/agent/hooks.ts`)

Lifecycle hook interface for extending agent behavior:

- `beforeIteration` — before each LLM call
- `beforeExecuteTools` — after tool calls received, before execution
- `afterIteration` — after iteration completes

Used for logging, monitoring, and approval flows.

## Data Flow

```text
CLI / REPL or Web UI Backend (parse protocol, load+validate config)
    │  plain input → AgentLoop.run()  (or .stream() with --stream)
    ▼
ContextBuilder.buildMessages()
    │  system prompt + history + user input
    ▼
AgentRunner.run() / runStream()
    │  iterative LLM calls + tool execution (AbortSignal-aware)
    ▼
Final Response (+ usage) + Session Save
```

For `--stream` and WebSocket turns, AgentRunner yields `AgentEvent`s (token/tool_call/tool_result/done) that the driver forwards to its client; the terminal `done` carries the same result `run()` would return.

## Design Principles

1. **Single responsibility** — each module does one thing
2. **Interfaces over implementations** — LLMProvider, Tool, Agent are all interfaces
3. **Errors are data** — tool errors are returned to the model, not thrown
4. **Workspace isolation** — file tools cannot escape the workspace directory
5. **No circular dependencies** — AgentLoop is the sole coordination hub
