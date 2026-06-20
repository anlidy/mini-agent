# mini-agent

A TypeScript AI agent — personal coding assistant with CLI, tool-calling, and extensible architecture.

`mini-agent` is a self-contained agent runtime built from scratch in TypeScript. It combines an LLM-powered agent loop with a set of built-in tools (file operations, search, web fetch) to help you work with codebases directly from the terminal. Streaming and a Web UI are planned — see `docs/ROADMAP.md`.

## Features

- **Agent Loop** — multi-turn tool-calling iteration with configurable max iterations
- **Tool System** — extensible tool registry with JSON Schema validation
- **Built-in Tools** — read/write files, list directories, find files, grep, web fetch
- **Provider Abstraction** — OpenAI-compatible API, works with DeepSeek, OpenAI, and others
- **Session Persistence** — JSONL-based session storage with history trimming
- **Context Management** — token estimation, context window budgeting, tool result compaction
- **Skills Framework** — workspace-level skills with YAML frontmatter and auto-injection
- **Hook System** — lifecycle hooks for tool execution, iteration tracking, and custom middleware
- **CLI REPL** — interactive terminal interface with session resume support

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

Inside the REPL:
- Type a message and press Enter.
- Use `/exit` or `/quit` to leave.
- Use `--resume` to print existing session history before continuing.

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
| `web_search` | Placeholder — returns a not-configured error until a search backend is added (see `docs/ROADMAP.md`) |

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
npm run repl        # start CLI REPL
npm run build       # compile TypeScript to dist/ and copy prompt templates
npm test            # run Vitest tests
npm run typecheck   # run TypeScript type checking
```

## Architecture

```text
src/
  agent/       AgentLoop, AgentRunner, ContextBuilder, hooks
  config/      config defaults and .mini-agent/config.json loading
  providers/   OpenAI-compatible provider abstraction
  session/     JSONL session persistence
  skills/      workspace skills discovery and summary
  tools/       tool registry and built-in tools
  prompts/     system prompt templates
```

See `docs/ARCHITECTURE.md` for detailed design and `docs/ROADMAP.md` for planned features.
