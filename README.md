# mini-agent

A TypeScript AI agent runtime — define an agent contract, connect via protocol (in-process or WebSocket), and build tools and clients on top.

`mini-agent` is a self-contained agent runtime built from scratch in TypeScript. It provides a transport-agnostic `AgentProtocol` contract with two built-in transports: a direct in-process client (`DirectAgentClient`) and a WebSocket-based server. Consumers — CLI, TUI, Web UI, or any language with a WebSocket library — talk to the runtime through the same protocol.

## Features

- **Agent Protocol** — transport-agnostic contract: `runTurn`, `abortTurn`, session CRUD, tool definitions
- **Direct Client** — zero-serialization in-process transport for CLI / TUI / embedded use
- **WebSocket Server** — cross-language streaming transport (`ws://`), one turn per connection, exec approval bridge
- **Agent Loop** — multi-turn tool-calling iteration with configurable max iterations
- **Streaming & Events** — `AgentEvent` discriminated union: `token`, `thinking`, `tool_call`, `tool_result`, `done`, `error`
- **Abort / Cancel** — cooperative `AbortSignal` threaded through loop, provider HTTP, and transport layers
- **Tool System** — extensible `ToolRegistry` with JSON Schema validation
- **Built-in Tools** — read/write files, list directories, find files, grep, web fetch, web search, apply patch, opt-in exec
- **Multi-Provider** — OpenAI-compatible + Anthropic Messages API, with message format conversion
- **Session Persistence** — revisioned JSONL snapshots with CAS, lock files, and atomic commit-before-`done`
- **Context Management** — pluggable token counting, context window budgeting, tool result summarization
- **Config Validation** — zod-validated `.mini-agent/config.json` with clear errors
- **Skills Framework** — validated global/project catalogs with project override and a bounded `read_skill` tool
- **Hook System** — lifecycle hooks for tool execution, iteration tracking, and custom middleware
- **Reference Clients** — CLI REPL and Web UI (React + Tailwind) built on the same protocol

## Requirements

- Node.js 22 or newer
- npm

## Install

```bash
npm install
npm run build
```

## Quick Start

### Library usage (programmatic, in-process)

```ts
import {
  createAgent,
  createDefaultToolRegistry,
  DirectAgentClient,
  SessionManager
} from "mini-agent";

const runtimeHome = process.env.MINI_AGENT_HOME ?? `${process.env.HOME}/.mini-agent`;
const agent = createAgent({ workspace: "/my-project", runtimeHome });
const sessionManager = new SessionManager({ sessionsDir: `${runtimeHome}/sessions` });
const tools = createDefaultToolRegistry();

const client = new DirectAgentClient({ agent, sessions: sessionManager, tools, workspace: "/my-project", runtimeHome });
await client.createSession({ key: "work-001", workspace: "/my-project" });

for await (const event of client.runTurn("Read README.md and summarize it.", {
  sessionKey: "work-001"
})) {
  if (event.type === "token") process.stdout.write(event.text);
  if (event.type === "done") console.log("usage:", event.result.usage);
}

// Session management through the same client
const savedSessions = await client.listSessions();
await client.deleteSession("work-001");
```

### Server (WebSocket transport)

```bash
node dist/server.js --workspace /path/to/project --host 127.0.0.1 --port 3210
```

Any WebSocket client can then connect:

```text
ws://127.0.0.1:3210/ws?session=my-session
```

Send JSON messages: `{"type":"user_message","text":"..."}`, `{"type":"abort"}`, `{"type":"approve_command","id":"...","approved":true}`. Receive streaming `AgentEvent` messages over the same socket.

### CLI REPL (reference terminal client)

```bash
node dist/cli.js --session default --resume
```

The first run auto-creates `$MINI_AGENT_HOME/config.json` and `$MINI_AGENT_HOME/sessions/` (`MINI_AGENT_HOME` defaults to `~/.mini-agent`). `--workspace` selects only the project working directory.

Edit `$MINI_AGENT_HOME/config.json` to set `apiKey`, `baseUrl`, `model`, or toggle `exec.enabled`.

Legacy project-local data is never copied automatically. Preview and apply an import explicitly:

```bash
mini-agent import --workspace /path/to/project
mini-agent import --workspace /path/to/project --apply
```

Inside the REPL:
- Type a message and press Enter to talk to the agent.
- `/help` — list commands.
- `/tools` — list registered tools.
- `/tool <name> <json>` — run a tool directly (e.g. `/tool apply_patch {"patch":"..."}`).
- `/exit` or `/quit` — leave.
- `Ctrl-C` during a turn interrupts it; again (or when idle) exits.

### Web UI (reference browser client)

Development:

```bash
npm --prefix webui install
npm run web:full            # both backend + frontend, Ctrl-C stops both
npm run server:dev          # backend only (tsx watch, :3210, auto-restart)
npm run web:dev             # frontend only (vite, :5173, proxies /api and /ws)
```

Production:

```bash
npm run web:build
npm run build
node dist/server.js --workspace . --host 127.0.0.1 --port 3210
```

Frontend stack: React 19 + TypeScript + Tailwind CSS 3 + Vite. Uses react-router v7 (`/chat/:sessionId`, `/settings`) and shadcn/ui v4 (`@base-ui/react` primitives). See `DESIGN.md` for the visual design system.

## Architecture

```
                        AgentProtocol (contract)
                              │
              ┌───────────────┼───────────────┐
              │               │               │
     DirectAgentClient   WebSocket Server   (future: Unix socket)
     (in-process)         (cross-language)
              │               │
          AgentLoop       AgentLoop
          SessionManager  SessionManager
          ToolRegistry    ToolRegistry
```

```
src/
  agent/       AgentLoop, AgentRunner, ContextBuilder, hooks, events, protocol
  client/      DirectAgentClient (in-process transport)
  config/      config defaults and .mini-agent/config.json loading
  providers/   OpenAI + Anthropic backends with streaming and tool conversion
  server/      HTTP/WebSocket server + REST API
  session/     JSONL session persistence
  skills/      workspace skills discovery and summary
  tools/       tool registry and built-in tools
  prompts/     system prompt templates
```

See `docs/ARCHITECTURE.md` for detailed design and `docs/ROADMAP.md` for planned features.

## REST API

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/sessions` | List saved sessions |
| `POST` | `/api/sessions` | Explicitly create a session |
| `GET` | `/api/sessions/:key` | Read a full session (404 when absent) |
| `PATCH` | `/api/sessions/:key` | Update metadata with `revision`; `workspace` may be `null` |
| `DELETE` | `/api/sessions/:key` | Delete a session |
| `GET` | `/api/config` | Read config (apiKey redacted) |
| `PUT` | `/api/config` | Write config patches atomically |
| `GET` | `/api/tools` | List tool definitions |
| `GET` | `/api/sessions/:key/files/tree?path=.` | Session-workspace directory tree |
| `GET` | `/api/sessions/:key/files/content?path=README.md` | Session-workspace file content |

## Built-In Tools

| Tool | Description |
|------|-------------|
| `read_file` | Read a UTF-8 file inside the workspace |
| `write_file` | Write a UTF-8 file, creating parent directories |
| `list_dir` | List directory contents |
| `find_files` | Find files by glob-like pattern |
| `grep` | Search text files with literal or regex patterns |
| `web_fetch` | Fetch an HTTP/HTTPS URL, convert HTML to text |
| `web_search` | Search the web via DuckDuckGo backend (configurable) |
| `apply_patch` | Apply a unified-diff patch with fuzzy hunk matching and dry-run |
| `read_skill` | Read a validated skill by catalog id |
| `exec` | Run a shell command — **opt-in** via `exec.enabled`, deny-listed, approval-gated |

All file tools are workspace-scoped and reject paths that escape the workspace.

## Sessions

Sessions live only under `$MINI_AGENT_HOME/sessions/`; filenames are full SHA-256 hashes of their canonical keys. The v1 header records `version`, `revision`, `message_count`, timestamps, and metadata. Saves use a short lock plus revision CAS and atomic rename. A streamed `done` means the completed/max-iteration result is already durable; abort, provider failure, conflict, and save failure end with `error` and do not change history. Tool side effects already executed before a failed commit cannot be rolled back.

## Skills

Global skills live at `$MINI_AGENT_HOME/skills/{id}/SKILL.md`; project skills live at `<workspace>/skills/{id}/SKILL.md` and override a global skill with the same id:

```markdown
---
name: repo-guide
description: Explains local repository conventions.
always: true
---

Use this skill when working in this repository.
```

The directory name is the stable id and must exactly match frontmatter `name`; `description` is required. The catalog summary is placed in the prompt and full content is read only through `read_skill`. `always` is displayed but is not auto-executed or auto-injected in this phase.

## Scripts

```bash
npm run repl          # start CLI REPL
npm run build         # compile TypeScript to dist/
npm test              # run backend Vitest tests
npm run typecheck     # run TypeScript type checking
npm run server:dev    # start backend dev server (tsx watch, :3210)
npm run web:dev       # start Vite for the React frontend (:5173)
npm run web:full      # start both backend + frontend concurrently
npm run web:build     # build the React frontend into dist/webui
npm run web:test      # run frontend Vitest tests only
```
