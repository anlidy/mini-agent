# Architecture

mini-agent is a TypeScript agent runtime organized into focused, single-responsibility modules. The `AgentProtocol` contract defines the runtime's surface; transports adapt that contract to different communication channels. Communication flows in one direction through well-defined interfaces.

## Module Map

```text
                    AgentProtocol (contract)
                          │
        ┌─────────────────┼─────────────────┐
        │                 │                 │
 DirectAgentClient   WebSocket Server   (future transports)
  (in-process)        (cross-language)
        │                 │
        ▼                 ▼
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
SkillsLoader ◀── $MINI_AGENT_HOME/skills/ + workspace/skills/
    │
    ▼
SessionManager ──▶ $MINI_AGENT_HOME/sessions/
```

## Modules

### CLI / REPL (`src/cli.ts`)

The application entry point and the only thing that talks to a human. `runCli`:

1. **Parse args** — `--workspace`, `--session`, `--resume`, `--stream`, or explicit `import [--apply]`.
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

### Protocol & Transport (`src/agent/protocol.ts`, `src/client/DirectAgentClient.ts`)

The `AgentProtocol` interface is the transport-agnostic contract for the agent runtime. Every consumer — CLI, TUI, Web UI, or an external program — interacts with the runtime through this contract. It defines:

- `runTurn(input, options)` — start a turn, get back `AsyncIterable<AgentEvent>`
- `abortTurn()` — cancel the in-flight turn
- `createSession()`, `listSessions()`, `getSession()`, `deleteSession()`, `updateSession()` — revision-aware session CRUD
- `getToolDefinitions()` — registered tools

`DirectAgentClient` is the in-process transport: it wraps an `Agent`, a `SessionManager`, and a `ToolRegistry` behind `AgentProtocol`. There is no serialization — the client yields native `AgentEvent` objects, and session operations delegate directly to the manager. This is the transport used by the CLI, TUI, or any Node.js embedder that wants zero-overhead access to the runtime.

The WebSocket server (`src/server/wsHandler.ts`) implements the same protocol over JSON — each `AgentEvent` is serialized as a JSON message on the wire. The `bindAgentConnection` function bridges a WebSocket to an `AgentLoop.stream()` call, translating `user_message`/`abort`/`approve_command` client messages into protocol operations. This is how the Web UI and any non-TS client consume the runtime.

Adding a new transport (e.g. Unix domain socket, HTTP SSE, gRPC) only requires a new implementation of the `AgentProtocol` contract — the core runtime (AgentLoop, tools, sessions) needs no changes.

### Web UI Backend (`src/server/`, `src/server.ts`)

The Web UI backend is a second thin driver beside the CLI. It starts a native Node `http.Server`, handles WebSocket upgrades via the `ws` library, and translates browser protocol messages into `AgentLoop.stream()` calls. It does not parse prompts, execute tools directly, or reach into runtime internals.

Entry points:

- `createServer(options)` — builds an HTTP server with REST routes, WebSocket upgrade handling, and static file serving.
- `startServer(options)` — creates and listens in one call.
- `src/server.ts` — executable wrapper (`node dist/server.js --workspace <dir> --host 127.0.0.1 --port 3210`).

Static frontend files are served from `dist/webui` by default. That location is
part of the mini-agent build output and is deliberately independent of
`--workspace`, which remains the user project root for config, sessions, file APIs,
and tools.

REST routes:

| Method | Path | Handler |
|---|---|---|
| `GET` | `/api/sessions` | `SessionManager.listSessions()` |
| `POST` | `/api/sessions` | Explicit Session creation |
| `GET` | `/api/sessions/:key` | Read only; 404 if missing |
| `PATCH` | `/api/sessions/:key` | Revision-CAS update; nullable workspace |
| `DELETE` | `/api/sessions/:key` | `SessionManager.deleteSession()` |
| `GET` | `/api/config` | redacted in-memory config |
| `PUT` | `/api/config` | `writeConfig()` + in-memory version bump |
| `GET` | `/api/tools` | configured `ToolRegistry.getDefinitions()` |
| `GET` | `/api/sessions/:key/files/tree?path=` | session-workspace file tree |
| `GET` | `/api/sessions/:key/files/content?path=` | session-workspace file content |

The WebSocket endpoint is `/ws?session=<key>` and binds only an already-created Session. Each connection owns one `AgentLoop` and one per-connection `ToolRegistry`, while HTTP and all connections share the same `SessionManager`. Incoming `user_message` starts a streamed turn; `abort` cancels it; `approve_command` resolves an exec approval. Per-connection overlap returns `turn_rejected`; a second connection targeting the same Session receives `session_busy` from the per-session lease.

Config is global per server instance. `PUT /api/config` writes `.mini-agent/config.json` atomically and bumps an in-memory version. Connections compare that version before the next turn and rebuild their `AgentLoop` when needed; active turns are not interrupted.

Security invariants:

- File APIs use the same workspace-prefix path containment rule as file tools.
- `GET /api/config` never returns plaintext API keys; `PUT /api/config` preserves the stored key when the client sends the redaction sentinel `***`.

### AgentLoop (`src/agent/AgentLoop.ts`)

The top-level coordinator. Creates and wires all dependencies, then executes the turn lifecycle:

1. **Lease/restore** — acquire the per-session lease, then read a revisioned snapshot
2. **Build** — construct messages via ContextBuilder (system prompt + history + user input)
3. **Run** — execute the tool-calling loop via AgentRunner
4. **Commit** — CAS-save only completed/max-iteration results
5. **Respond** — emit `done` only after commit; otherwise emit/throw the typed error

AgentLoop is the sole wiring/coordination layer — it constructs and connects every subsystem. Other modules depend only on the narrow interfaces they are handed.

### AgentRunner (`src/agent/AgentRunner.ts`)

The core execution engine. Takes a spec (`AgentRunSpec`) and runs the LLM + tool-calling iteration loop. A single internal `execute(spec, streaming)` generator backs two public entry points:

- `run(spec)` — consumes the loop with streaming disabled (always `provider.chat`), so its behavior and the provider contract are unchanged. Returns `AgentRunResult`.
- `runStream(spec)` — prefers `provider.chatStream` and yields internal runner events. `AgentLoop` buffers its terminal result and only exposes `done` after the Session commit succeeds.

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
- **Tool result compaction** — summarize old results only when their Tool metadata allows it
- **Context budget trimming** — budget system, tool definitions, current turn, and output reserve first, then drop whole old user turns; required-content overflow throws `ContextBudgetError` before Provider I/O
- **Cooperative abort** — an `AbortSignal` on the spec exits the loop cleanly with `stopReason: "aborted"`

### Events & streaming (`src/agent/events.ts`)

`AgentEvent` is the discriminated union surfaced by `runStream` / `AgentLoop.stream`: `token`, `tool_call`, `tool_result`, `done`, `error`. Providers expose streaming through an optional `chatStream(): AsyncIterable<ProviderStreamEvent>`; the runner falls back to `chat()` when it is absent. `AgentLoop.stream` is the public commit boundary: it suppresses the runner terminal event, commits the Session, then emits exactly one terminal `done`; aborts and failures emit one terminal `error` instead.

### Provider (`src/providers/`)

Abstracts the LLM backend behind a single interface:

```ts
interface LLMProvider {
  defaultModel(): string;
  chat(request: ChatRequest): Promise<LLMResponse>;
  chatStream?(request: ChatRequest): AsyncIterable<ProviderStreamEvent>;
  /** Fetch the list of available models from the provider API. */
  listModels?(): Promise<string[]>;
}
```

**OpenAIProvider** — OpenAI-compatible API (DeepSeek, OpenAI, etc.). Parses SSE for
`chatStream`, accumulates fragmented tool calls by index. Shares one request path
with `chat` that composes the caller's `AbortSignal` with an internal timeout.

**AnthropicProvider** — Anthropic Messages API with extended thinking support.
Converts OpenAI-format messages to Anthropic's native content-block format:
system messages merged into top-level `system` param, tool messages wrapped as
`tool_result` blocks, assistant tool_calls expanded into `tool_use` blocks.
Maps agent effort (1–4) to Anthropic thinking budget tokens (4K/4K/16K/32K).
Parses SSE content blocks (`text_delta`/`thinking_delta`/`input_json_delta`) and
assembles tool use fragments by block index into complete ToolCallRequests.

Both providers implement `listModels()`: GET `<baseUrl>/models`, parse the
response's `data[].id` field, sort alphabetically. OpenAIProvider uses Bearer
auth; AnthropicProvider uses `x-api-key` + `anthropic-version` headers.

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

JSONL-based transactional persistence:

- Sessions stored once as `$MINI_AGENT_HOME/sessions/{sha256(key)}.jsonl`
- v1 header contains canonical `key`, `version`, `revision`, `message_count`, timestamps, and metadata; v0 is upgraded on its next successful save
- `metadata.workspace` is a canonical existing directory; absence means a per-session directory under Runtime Home `scratch/`
- `metadata.title` is auto-derived from the first user message; can be updated via `PATCH /api/sessions/:key`
- Invalid JSONL records fail with filename and original line number
- Saves acquire a short `.lock`, re-read disk revision, enforce CAS, write a PID+UUID temp file, and atomically rename
- New sessions default `metadata.source` from the driver (`cli` or `webui`)
- History selection uses a soft message limit over complete user turns; `maxHistoryChars` is compatibility-only
- v1 listing reads only the header; v0 listing fully scans for compatibility
- snapshots are deep-cloned and saves return the next revision; no mutable Session cache is shared
- active leases reject turns, PATCH, and delete. Cross-process contenders compute concurrently but only one revision can commit

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

Builds one catalog from `$MINI_AGENT_HOME/skills/{id}/SKILL.md` and `workspace/skills/{id}/SKILL.md`:

- Requires frontmatter `name` to equal the directory id and a non-empty description
- Project ids override global ids; invalid files and realpath escapes fail before Provider I/O
- Generates a summary injected into the system prompt
- Loads full content only through the catalog-backed `read_skill` tool; `always` is informational in phase one

### Config (`src/config/`)

Loads, merges, and validates global configuration. All functions take Runtime Home (default `MINI_AGENT_HOME` or `~/.mini-agent`):

- `defaultConfig(runtimeHome)` — hardcoded defaults; sessions.dir = `<runtimeHome>/sessions`
- `loadConfig(configDir)` — reads `<configDir>/config.json`, deep-merges over defaults, validates against zod schema
- `ensureDefaultConfig(configDir)` — auto-creates the config file on first run
- `writeConfig(patch, configDir)` — writes validated provider/agent/search/exec config patches atomically, preserves stored API keys when a UI round-trip sends `***`
- `configFilePath(configDir)` — returns `<configDir>/config.json`

`RuntimePaths` is the only path authority for config, sessions, global skills, scratch, and canonical project workspaces. `--workspace` never selects credentials or Session storage. Legacy project-local data is read only by the explicit, dry-run-first import command; `.mini-agent/project.json` overrides remain deferred.

### Hooks (`src/agent/hooks.ts`)

Lifecycle hook interface for extending agent behavior:

- `beforeIteration` — before each LLM call
- `beforeExecuteTools` — after tool calls received, before execution
- `afterIteration` — after iteration completes

Used for logging, monitoring, and approval flows.

## Data Flow

```text
Transport (DirectAgentClient / WebSocket)
    │  AgentProtocol.runTurn(input, options) → AsyncIterable<AgentEvent>
    ▼
AgentLoop.run() / stream()
    │  prepares session, builds context
    ▼
ContextBuilder.buildMessages()
    │  system prompt + history + user input
    ▼
AgentRunner.run() / runStream()
    │  iterative LLM calls + tool execution (AbortSignal-aware)
    ▼
Session CAS commit → terminal `done` (+ usage)
```

For `--stream` and WebSocket turns, AgentRunner yields `AgentEvent`s (token/tool_call/tool_result/done) that the driver forwards to its client; the terminal `done` carries the same result `run()` would return.

## Design Principles

1. **Single responsibility** — each module does one thing
2. **Interfaces over implementations** — LLMProvider, Tool, Agent are all interfaces
3. **Errors are data** — tool errors are returned to the model, not thrown
4. **Workspace isolation** — file tools cannot escape the workspace directory
5. **No circular dependencies** — AgentLoop is the sole coordination hub
