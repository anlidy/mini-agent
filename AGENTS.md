# AGENTS.md

This repository is a TypeScript AI agent project — a personal coding assistant with CLI, tool-calling, and extensible architecture. Work in this project should preserve the existing modular boundaries and keep the CLI usable.

## Project Commands

Run these before claiming a change is complete:

```bash
npm test
npm run typecheck
npm run build
```

Use the REPL during manual verification:

```bash
npm run repl -- --session default --resume
```

After build:

```bash
node dist/cli.js --session default --resume
node dist/server.js --workspace . --host 127.0.0.1 --port 3210
```

Web UI development (run from source, auto-restart on change — no build step needed):

```bash
npm run server:dev          # backend only (tsx watch on src/server.ts, :3210)
npm run web:dev             # frontend only (vite, :5173, proxies /api and /ws)
npm run web:full            # both concurrently (Ctrl-C stops both cleanly)
```

Production Web UI builds emit to `dist/webui`; do not derive that static path from
`--workspace`, which is the user project root.

## Architecture Boundaries

- `src/agent/AgentLoop.ts` coordinates session, context, runner, tools, and response persistence. It is the ONLY coordination layer.
- `src/agent/AgentRunner.ts` owns the provider/tool-call iteration loop. Must not know about sessions or workspace product logic.
- `src/providers/*` must not execute tools. Returns tool call requests only.
- `src/tools/*` must not know about providers or sessions.
- `src/session/*` persists and trims message history; must not parse prompts or call providers.
- `src/agent/ContextBuilder.ts` builds prompt/messages only; must not call tools or providers.
- `src/skills/SkillsLoader.ts` reads skill metadata and content only; must not execute skills.
- `src/server/*` is a thin HTTP/WebSocket driver. It may call `AgentLoop`, `SessionManager`, config helpers, and `ToolRegistry` factories, but must not execute tools directly or parse prompts.
  - **SessionManager MUST be shared**: the HTTP layer and WebSocket handler must use a single `SessionManager` instance. Creating separate instances causes cache divergence — the HTTP reader will never see messages written by the WS side. The shared instance is created in `createRequestHandler`, exposed on the handler, and passed through `handleWebSocketUpgrade` → `bindAgentConnection` → `buildAgent` → `AgentLoop`.

## Runtime Data

Local runtime data lives under:

```text
.mini-agent/
```

This directory is git-ignored. Do not commit local config, API keys, or session JSONL files.

Never hard-code or expose API keys, tokens, credentials, local provider secrets, or real config values in git-committable source, tests, docs, fixtures, generated defaults, or examples. Use placeholders, omitted fields, environment variables, or `.mini-agent/config.json` values that remain local and git-ignored.

## Tooling Rules

- Prefer `rg` for code search.
- Keep edits scoped to the requested behavior.
- Add focused tests for new behavior.
- Use ASCII in source files unless a file already uses non-ASCII or user-facing text requires it.
- Do not change generated `dist/` files manually; run `npm run build`.

## CLI Expectations

The CLI should:

- create `.mini-agent/config.json` on first run,
- print a clean `Config error:` message (not a stack trace) when config is invalid,
- use the configured OpenAI-compatible provider,
- save sessions to `.mini-agent/workspace/sessions/{key}.jsonl`,
- support `--resume` by printing previous user/assistant messages,
- support `--stream` to print assistant tokens live,
- continue conversations using previous session history,
- support `/help`, `/tools`, `/tool <name> <json>`, `/exit`, and `/quit`,
- abort the in-flight turn on `Ctrl-C` (and exit when idle).

## Web Backend Expectations

The local server should:

- bind to `127.0.0.1` by default,
- expose REST routes under `/api` with JSON `{ error }` failures,
- redact `provider.apiKey` from `GET /api/config`,
- preserve the real API key when `PUT /api/config` receives `***`,
- keep file tree/content APIs workspace-scoped and read-only,
- use one active turn per WebSocket connection and reject overlaps with `turn_rejected`,
- bridge `exec` approvals through the same WebSocket connection,
- abort in-flight turns and reject pending approvals on connection close.

## Built-In Tool Expectations

Default tools should stay workspace-scoped:

- `read_file`
- `write_file`
- `list_dir`
- `find_files`
- `grep`
- `web_fetch`
- `web_search`
- `apply_patch`

File tools must reject paths that escape the workspace.

The `exec` tool (shell commands) is NOT registered by default. It is opt-in via
`exec.enabled` in config, pins `cwd` to the workspace, refuses a deny list of
destructive commands, and honors the `approveCommand` gate on the execution
context. Keep it off unless a workflow explicitly needs it.

## Deep-dive references

This file is the rulebook (boundaries, red lines, command quick-ref). For detailed
mechanisms, data flow, and design rationale, see:

| Document | Covers |
|---|---|
| `docs/ARCHITECTURE.md` | Full architecture: module map, data flow, design principles, subsystem responsibilities |
| `docs/ROADMAP.md` | Phase progress, completed features, pending work |
