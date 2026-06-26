# mini-agent

A TypeScript AI agent — personal coding assistant with CLI, tool-calling, and extensible architecture.

`mini-agent` is a self-contained agent runtime built from scratch in TypeScript. It combines an LLM-powered agent loop with a set of built-in tools (file operations, search, web fetch) to help you work with codebases from the terminal or through the local Web UI backend. Frontend work is tracked in `docs/ROADMAP.md`.

## Features

- **Agent Loop** — multi-turn tool-calling iteration with configurable max iterations
- **Streaming & Events** — `Agent.stream()` yields token/tool/done events over an SSE-backed provider
- **Abort / Cancel** — cooperative `AbortSignal` threaded through the loop and provider HTTP requests
- **Tool System** — extensible tool registry with JSON Schema validation
- **Built-in Tools** — read/write files, list directories, find files, grep, web fetch, web search, apply patch, opt-in exec
- **Provider Abstraction** — OpenAI-compatible API, works with DeepSeek, OpenAI, and others
- **Session Persistence** — JSONL-based session storage with history trimming
- **Context Management** — pluggable token counting, context window budgeting, tool result summarization, `usage` reporting
- **Config Validation** — zod-validated `.mini-agent/config.json` with clear errors and early API-key checks
- **Skills Framework** — workspace-level skills with YAML frontmatter and auto-injection
- **Hook System** — lifecycle hooks for tool execution, iteration tracking, and custom middleware
- **CLI REPL** — interactive terminal interface with session resume and `--stream` support
- **Web UI Backend** — local HTTP/WebSocket server with session, config, tool, file, streaming, and exec-approval APIs

## Requirements

- Node.js 22 or newer
- npm

## Install

```bash
npm install
```

## Quick Start

Start the CLI REPL:

```bash
npm run repl -- --session default --resume
```

The first run creates:

```text
.mini-agent/config.json
.mini-agent/workspace/sessions/
```

The default config uses DeepSeek through the OpenAI-compatible provider:

```json
{
  "provider": {
    "name": "deepseek",
    "baseUrl": "https://api.deepseek.com/v1",
    "model": "deepseek-chat"
  }
}
```

Edit `.mini-agent/config.json` to change `apiKey`, `baseUrl`, `model`, timeout, session directory, or agent limits.

## CLI Usage

```bash
npm run repl -- --session default --resume
npm run repl -- --workspace /path/to/project --session my-session --resume
```

After building:

```bash
npm run build
node dist/cli.js --session default --resume
```

Flags: `--workspace <dir>`, `--session <key>`, `--resume` (print history first), `--stream` (print tokens live).

Inside the REPL:
- Type a message and press Enter to talk to the agent.
- `/help` — list commands.
- `/tools` — list registered tools (reflects your config: search backend, exec on/off).
- `/tool <name> <json>` — run a tool directly, no model call (e.g. `/tool apply_patch {"patch":"..."}`).
- `/exit` or `/quit` — leave.
- `Ctrl-C` during a turn interrupts it gracefully; again (or when idle) exits.

## Web UI Backend

Start the local backend:

```bash
npm run build
node dist/server.js --workspace /path/to/project --host 127.0.0.1 --port 3210
```

The server binds to `127.0.0.1` by default and exposes a thin browser-facing driver over the existing `AgentLoop`. It serves production frontend build output from `dist/webui`; this path is independent of `--workspace`.

Frontend development (all run from source, no build step for the backend):

```bash
npm --prefix webui install
npm run web:full            # both servers (tsx watch + vite), Ctrl-C stops both
npm run server:dev          # backend only, auto-restarts on source change
npm run web:dev             # frontend only (vite, proxies /api and /ws to :3210)
```

Production frontend build:

```bash
npm run web:build
npm run build
node dist/server.js --workspace . --host 127.0.0.1 --port 3210
```

The dev server proxies `/api` and `/ws` to the local backend. The Node backend
serves `dist/webui` after `npm run web:build`.

REST API:

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/sessions` | List saved sessions |
| `GET` | `/api/sessions/:key` | Read a full session |
| `DELETE` | `/api/sessions/:key` | Delete a session JSONL file |
| `GET` | `/api/config` | Read config with `provider.apiKey` redacted to `***` |
| `PUT` | `/api/config` | Write provider/agent/search/exec config patches atomically |
| `GET` | `/api/tools` | List configured tool definitions |
| `GET` | `/api/files/tree?path=.` | Read a workspace-contained directory tree |
| `GET` | `/api/files/content?path=README.md` | Read workspace-contained file content |

WebSocket:

```text
ws://127.0.0.1:3210/ws?session=default
```

Client messages are `user_message`, `abort`, and `approve_command`. Server messages include `session`, streamed agent events (`token`, `tool_call`, `tool_result`, `done`, `error`), `approve_request`, and `turn_rejected`. Only one turn can run at a time per connection.

## Verifying the runtime (Phase 2)

Most features can be exercised straight from the REPL. Tool plumbing, config
validation, and abort need no API key; streaming and token usage need a live
provider.

No API key needed:

```bash
npm run repl -- --workspace /tmp/demo
```

- **Config validation** — put `{"agent":{"maxIterations":"lots"}}` in
  `/tmp/demo/.mini-agent/config.json` and start the REPL. It prints
  `Config error: ... agent.maxIterations: expected number ...` and exits cleanly.
- **Tool registration** — `/tools` lists 8 tools by default (incl. `apply_patch`,
  `web_search`). `exec` appears only when `exec.enabled` is true in config.
- **apply_patch** — `/tool apply_patch {"patch":"--- /dev/null\n+++ b/x.txt\n@@ -0,0 +1,1 @@\n+hi"}`
  creates `x.txt`. Add `"dryRun":true` to preview without writing.
- **exec** (opt-in) — set `{"exec":{"enabled":true}}`, then
  `/tool exec {"command":"echo hi"}`. Try `/tool exec {"command":"rm -rf /"}` to
  see the deny list refuse it.
- **web_search** — with no config it returns a "not configured" message; set
  `{"search":{"backend":"duckduckgo"}}` and `/tool web_search {"query":"..."}`
  returns ranked results (needs network).

With an API key (`provider.apiKey` or `MINI_AGENT_API_KEY`):

- **Streaming + events** — run with `--stream`; assistant tokens print live, then
  a `usage>` line.
- **Token usage** — every reply prints `usage> prompt_tokens=… completion_tokens=…`.
- **Abort** — start a long turn and press `Ctrl-C`; it stops gracefully and
  returns to the prompt instead of killing the process.
- **Missing key** — unset the key and send a message: it fails fast with
  `Missing provider API key`.

## Sessions

Sessions are stored as JSONL:

```text
.mini-agent/workspace/sessions/{key}.jsonl
```

Session keys are sanitized for filenames. Each line is one message record — tool calls and results are saved so resumed conversations continue with full context.

## Built-In Tools

| Tool | Description |
|------|-------------|
| `read_file` | Read a UTF-8 file inside the workspace |
| `write_file` | Write a UTF-8 file, creating parent directories |
| `list_dir` | List directory contents |
| `find_files` | Find files by glob-like pattern |
| `grep` | Search text files with literal or regex patterns |
| `web_fetch` | Fetch an HTTP/HTTPS URL and convert HTML to text |
| `web_search` | Search the web via the DuckDuckGo backend when `search.backend` is configured (default `none`) |
| `apply_patch` | Apply a unified-diff patch with fuzzy hunk matching and a dry-run mode |
| `exec` | Run a shell command in the workspace — **opt-in** via `exec.enabled`, deny-listed and approval-gated |

File tools are workspace-scoped and skip common generated directories (`node_modules`, `.git`, `dist`, `coverage`).

## Skills

Workspace skills can be added under `skills/{name}/SKILL.md`:

```markdown
---
name: repo-guide
description: Explains local repository conventions.
always: true
---

Use this skill when working in this repository.
```

Skills are discovered at runtime and injected into the system prompt.

## Library Usage

```ts
import { createAgent } from "mini-agent";

const agent = createAgent({
  workspace: process.cwd(),
  sessionKey: "default"
});

const result = await agent.run("Read README.md and summarize it.");
console.log(result.content);
```

Custom provider or tools:

```ts
import { AgentLoop, OpenAIProvider, createDefaultToolRegistry } from "mini-agent";

const agent = new AgentLoop({
  workspace: process.cwd(),
  provider: new OpenAIProvider({
    apiKey: process.env.DEEPSEEK_API_KEY ?? "",
    baseUrl: "https://api.deepseek.com/v1",
    model: "deepseek-chat"
  }),
  tools: createDefaultToolRegistry()
});
```

## Scripts

```bash
npm run repl         # start CLI REPL
npm run build        # compile TypeScript to dist/ and copy prompt templates
npm test             # run Vitest tests
npm run typecheck    # run TypeScript type checking
npm run server:dev   # start backend dev server (tsx watch, :3210, auto-restart)
npm run web:dev      # start Vite for the React frontend (:5173)
npm run web:full     # start both backend + frontend concurrently
npm run web:build    # build the React frontend into dist/webui
npm run web:test     # run frontend Vitest tests
node dist/server.js  # start the local HTTP/WebSocket backend after build
```

## Architecture

```text
src/
  agent/       AgentLoop, AgentRunner, ContextBuilder, hooks
  config/      config defaults and .mini-agent/config.json loading
  providers/   OpenAI-compatible provider abstraction
  session/     JSONL session persistence
  server/      local HTTP/WebSocket backend for the Web UI
  skills/      workspace skills discovery and summary
  tools/       tool registry and built-in tools
  prompts/     system prompt templates
```

See `docs/ARCHITECTURE.md` for detailed design and `docs/ROADMAP.md` for planned features.
