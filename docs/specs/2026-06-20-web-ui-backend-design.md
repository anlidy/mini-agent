# Phase 3 (Backend) — Web UI HTTP/WS Server Design

Status: implemented and merged to `main`.
Branch: originally designed on `worktree-phase2-opus-4.8`; now on `main`.
Scope source: `docs/ROADMAP.md` → Phase 3 (Backend half only; Frontend is a separate spec).

## Goals

Add an HTTP/WebSocket server that exposes the existing agent runtime to a browser
client, playing the same role the CLI currently plays: a thin driver that does I/O and
protocol translation only, never reaching into runtime internals. `AgentLoop` stays
the sole entry point. The CLI (`src/cli.ts`) is untouched; both drivers coexist.

Deployment target is **local single-user** (`127.0.0.1`): no auth, no CORS. Two
security invariants still hold (path-traversal containment, API-key redaction).

First-version scope (all confirmed): WS streaming echo, session list/history/delete,
read-only file API, config read/write-with-apply, exec approval bridge, and serving
the frontend build output.

`npm test`, `npm run typecheck`, `npm run build` must stay green. Only one new runtime
dependency: `ws` (zero transitive deps), matching the project's minimal-runtime ethos.

## Architecture & process model

Single process. A native `http.Server` and a `ws.WebSocketServer` share one port.
REST goes over http; all real-time interaction goes over WS. Default bind
`127.0.0.1`, port configurable.

The server subsystem lives under `src/server/` and is structured as small, single-
purpose modules communicating through well-defined types. It depends on the public
runtime surface only (`AgentLoop`, `AgentEvent`, `SessionManager`, `ToolRegistry`
factory, config loader) — never on runtime internals.

## Instance lifecycle (key decision)

- Each WS connection is one session view. It constructs a **per-connection
  `ToolRegistry`** (exec enabled, `approveCommand` bridged to that connection's WS).
- Because tools are per-connection, the `AgentLoop` is also constructed per
  connection, injecting that connection's registry.
- Config is global (one in-memory copy). `PUT /api/config` writes it back and bumps
  an in-memory version counter. Each connection compares the version **before
  starting the next turn**; if it changed, it rebuilds its `AgentLoop` with the new
  config. An in-progress turn is never interrupted by a config change.
- A single connection allows only one active turn at a time: a second `user_message`
  arriving before the prior `done` is rejected with `turn_rejected`. Different
  connections run independently.

## Module layout

| File | Responsibility |
|---|---|
| `src/server/index.ts` | `createServer(opts)` factory + `startServer()`; wires http + ws, owns lifecycle. |
| `src/server/protocol.ts` | WS client↔server message types (shared TS types, also consumed by the future frontend). |
| `src/server/wsHandler.ts` | Per-connection: parse messages, drive `AgentLoop.stream`, approveCommand bridge, abort. |
| `src/server/httpRouter.ts` | Minimal REST router (method + path → handler), JSON body parsing, error envelope. |
| `src/server/routes/sessions.ts` | `GET /api/sessions`, `GET/DELETE /api/sessions/:key`. |
| `src/server/routes/config.ts` | `GET/PUT /api/config` (redaction + zod validation). |
| `src/server/routes/files.ts` | `GET /api/files/tree`, `GET /api/files/content` (workspace-contained). |
| `src/server/routes/tools.ts` | `GET /api/tools`. |
| `src/server/static.ts` | Static file serving for the frontend build + SPA fallback. |
| `src/server.ts` (bin) | Executable entry: load config, start server. |

## Runtime-side additions (new, independent, no existing-signature changes)

1. `SessionManager.listSessions(): Promise<SessionSummary[]>` — scans `sessionsDir`
   for JSONL files, returns `{ key, createdAt, updatedAt, messageCount, preview }[]`
   (preview = first user message, truncated). Backs `GET /api/sessions`.
2. `SessionManager.deleteSession(key): Promise<void>` — removes the session's JSONL
   file (no-op if absent). Backs `DELETE /api/sessions/:key`.
3. `writeConfig(partial, path): Promise<Config>` — merges the user-editable subset
   (provider/model/agent params) into the existing config file and writes atomically
   (temp + rename, reusing SessionManager's pattern). Validates via the existing zod
   schema before writing. Backs `PUT /api/config`.

Each ships with focused unit tests (tmp dirs), decoupled from the server — valuable
independently even if the server design later changes.

## WS protocol (`src/server/protocol.ts`)

Connection binding: `ws://host:port/ws?session=<key>`. With a key, binds that
session; without, the server generates a new key and sends `{ type: "session", key }`
as the first server message after connect.

Client → server (`ClientMessage`):

| type | fields | meaning |
|---|---|---|
| `user_message` | `text` | start a turn |
| `abort` | — | abort the current turn |
| `approve_command` | `id, approved` | answer an exec approval request |

Server → client (`ServerMessage`):

| type | fields | meaning |
|---|---|---|
| `session` | `key` | connection established, echoes session key |
| `token` / `tool_call` / `tool_result` / `done` / `error` | (mirror `AgentEvent`) | forwarded runtime events |
| `approve_request` | `id, command` | request approval for one exec command |
| `turn_rejected` | `reason` | a turn is already active on this connection |

`AgentEvent` is already a JSON-serializable discriminated union, so forwarding is
near-zero adaptation.

## REST endpoints (all under `/api`, JSON)

| Method | Path | Response |
|---|---|---|
| GET | `/api/sessions` | `SessionSummary[]` |
| GET | `/api/sessions/:key` | full session (incl. messages) |
| DELETE | `/api/sessions/:key` | 204 |
| GET | `/api/config` | current config, **API key redacted** to `***` |
| PUT | `/api/config` | write user-editable subset, returns new config |
| GET | `/api/tools` | `ToolRegistry.getDefinitions()` |
| GET | `/api/files/tree?path=` | directory tree, **workspace-contained** |
| GET | `/api/files/content?path=` | file content, **workspace-contained** |
| GET | `/*` | static frontend build + SPA fallback |

## Key flow: exec approval bridge (bidirectional RPC)

1. Agent calls exec → `ToolExecutionContext.approveCommand(cmd)` fires.
2. The per-connection registry's implementation generates an `id`, sends WS
   `approve_request {id, command}`, returns a pending Promise, stores it in a
   `Map<id, resolve>`.
3. Client shows a dialog → user approves/rejects → sends `approve_command {id, approved}`.
4. `wsHandler` looks up `resolve(approved)`; the Promise settles; exec proceeds or
   refuses accordingly.
5. Timeout (default 60s, configurable) or connection close → `resolve(false)` and
   cleanup, so the Promise never hangs.

## Key flow: config write-and-apply

`PUT /api/config` → zod validation → atomic file write → bump in-memory config
version counter. Each connection compares the version **before the next
`user_message`**; if changed, it rebuilds its `AgentLoop` with the new config
(swaps provider / params). In-progress turns are unaffected.

Redaction round-trip: since `GET` returns the API key as `***`, `PUT` treats an
incoming `apiKey` equal to the redaction sentinel as "unchanged" and preserves the
stored key — only a different value overwrites it. This prevents a read-modify-write
of the whole config object from clobbering the real key with `***`.

## Error handling

- REST uniform `{ error }` envelope: 400 validation, 404 not found, **403 path
  escape**, 500 internal.
- WS: an agent error becomes an `error` event, connection stays open; **connection
  close aborts the in-progress turn and clears all pending approvals**.
- Abort flows through `AbortSignal` end-to-end; `done` carries `stopReason: "aborted"`.

## Security (the two invariants that hold even for local single-user)

- Files API normalizes `path` and enforces a workspace-prefix check; anything
  escaping the workspace (e.g. via `../`) returns 403.
- `GET /api/config` redacts the API key — never returns plaintext.

## Testing

- Runtime additions (`listSessions`, `deleteSession`, `writeConfig`): focused unit
  tests over tmp dirs.
- `httpRouter`: route-matching unit tests.
- REST routes: integration tests (boot server + `fetch`), incl. 403 path-escape and
  config redaction assertions.
- `wsHandler`: integration tests (ws client connects; assert token/done stream,
  abort, and a full approve round-trip).
- All tests use a **fake `LLMProvider`** (DI already supported) — no live network,
  no billing.

## Out of scope (separate specs / later)

- Frontend (React/UI) — its own Phase 3 spec.
- Auth, CORS, multi-user, network exposure — deployment is local single-user.
- Live file writes via REST (file API is read-only; the agent still writes via tools).


