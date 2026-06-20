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
```

## Architecture Boundaries

- `src/agent/AgentLoop.ts` coordinates session, context, runner, tools, and response persistence. It is the ONLY coordination layer.
- `src/agent/AgentRunner.ts` owns the provider/tool-call iteration loop. Must not know about sessions or workspace product logic.
- `src/providers/*` must not execute tools. Returns tool call requests only.
- `src/tools/*` must not know about providers or sessions.
- `src/session/*` persists and trims message history; must not parse prompts or call providers.
- `src/agent/ContextBuilder.ts` builds prompt/messages only; must not call tools or providers.
- `src/skills/SkillsLoader.ts` reads skill metadata and content only; must not execute skills.

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
- use the configured OpenAI-compatible provider,
- save sessions to `.mini-agent/workspace/sessions/{key}.jsonl`,
- support `--resume` by printing previous user/assistant messages,
- continue conversations using previous session history,
- support `/exit` and `/quit`.

## Built-In Tool Expectations

Default tools should stay workspace-scoped:

- `read_file`
- `write_file`
- `list_dir`
- `find_files`
- `grep`
- `web_fetch`
- `web_search`

File tools must reject paths that escape the workspace.
