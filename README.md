# mini-agent

Minimal TypeScript reimplementation of nanobot's core agent architecture.

`mini-agent` is a small, embeddable TypeScript agent runtime with:

- `AgentLoop`
- `AgentRunner`
- provider abstraction
- tool registry
- session manager
- context builder
- skills loader framework
- CLI REPL
- JSONL session persistence
- OpenAI-compatible provider support
- built-in file/search/web tools

See `docs/nanobot-core-ts-scope.md` and `docs/nanobot-core-ts-checklist.md` for the implementation scope.

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

You can edit `.mini-agent/config.json` to change `apiKey`, `baseUrl`, `model`, timeout, session directory, or agent limits.

## CLI Usage

Run against the current workspace:

```bash
npm run repl -- --session default --resume
```

Run against another workspace:

```bash
npm run repl -- --workspace /path/to/workspace --session my-session --resume
```

After building:

```bash
npm run build
node dist/cli.js --session default --resume
```

Inside the REPL:

- Type a normal message and press Enter.
- Use `/exit` or `/quit` to leave.
- Use `--resume` to print existing session history before continuing.

## Sessions

Sessions are stored as JSONL:

```text
.mini-agent/workspace/sessions/{key}.jsonl
```

Session keys are sanitized for filenames. For example:

```text
project:default -> project_default.jsonl
```

Each line is one message record. Tool calls and tool results are saved, so resumed conversations can continue with useful history.

## Built-In Tools

The default agent registers these tools:

- `read_file`: read a UTF-8 file inside the workspace
- `write_file`: write a UTF-8 file inside the workspace
- `list_dir`: list workspace directory entries
- `find_files`: find files by simple glob-like pattern
- `grep`: search text files
- `web_fetch`: fetch an HTTP/HTTPS URL and convert basic HTML to text
- `web_search`: placeholder tool that reports when search is not configured

File tools are restricted to the workspace and skip common generated directories such as `node_modules`, `.git`, `dist`, and `coverage`.

Example prompts:

```text
Read README.md and summarize it.
Find all TypeScript files related to sessions.
Search the project for "AgentRunner".
Write notes/todo.txt with a short implementation checklist.
```

## Skills

Workspace skills can be added under:

```text
skills/{name}/SKILL.md
```

`SkillsLoader` reads YAML frontmatter and injects a skills summary into the system prompt.

Example:

```markdown
---
name: repo-guide
description: Explains local repository conventions.
always: true
---

Use this skill when working in this repository.
```

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

You can inject a custom provider or tool registry:

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
npm run repl        # start CLI REPL from src/cli.ts
npm run build       # compile to dist and copy prompt templates
npm test            # run Vitest tests
npm run typecheck   # run TypeScript type checking
```

## Project Layout

```text
src/
  agent/       AgentLoop, AgentRunner, ContextBuilder
  config/      config defaults and .mini-agent/config.json loading
  providers/   OpenAI-compatible provider abstraction
  session/     JSONL session persistence
  skills/      workspace skills discovery and summary
  tools/       tool registry and built-in tools
  prompts/     system prompt templates
```

## Notes

`.mini-agent/` is ignored by git because it contains local config and session data.
