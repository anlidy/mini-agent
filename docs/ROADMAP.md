# Roadmap

## Phase 1 — Core Agent Runtime ✅

Completed. See `docs/archive/` for the original scope and checklist.

- AgentLoop / AgentRunner tool-calling iteration
- OpenAI-compatible provider abstraction
- Built-in tools: read_file, write_file, list_dir, find_files, grep, web_fetch, web_search
- JSON Schema tool parameter validation
- JSONL session persistence with history trimming
- Context management (token estimation, compaction, budget trimming)
- Skills framework with YAML frontmatter
- Hook lifecycle system
- CLI REPL with session resume
- Config auto-generation on first run

## Phase 2 — Runtime Enhancements ✅

Core improvements needed before building the Web UI. Completed on branch
`worktree-phase2-opus-4.8`.

### Streaming Support

- [x] Add `chatStream()` to LLMProvider interface (optional method)
- [x] Implement SSE parsing in OpenAIProvider
- [x] Add streaming mode to AgentRunner with token-level events
- [x] Agent interface: add `stream()` method alongside existing `run()`

### Abort / Cancel

- [x] Thread an `AbortSignal` from AgentLoop.run/stream options
- [x] Wire abort signal through to provider HTTP requests (composed with timeout)
- [x] Graceful stop — exit iteration loop cleanly on abort (`stopReason: "aborted"`)

### Agent Event API

- [x] Define event types: `token`, `tool_call`, `tool_result`, `done`, `error`
- [x] Agent.stream() returns AsyncIterable<AgentEvent>
- [x] Backward-compatible: existing `run()` unchanged (forces non-streaming path)

### Real Web Search

- [x] Integrate DuckDuckGo (HTML endpoint, no API key)
- [x] Configurable search backend via config.json (`search.backend`, default `none`)
- [x] Error handling (network/non-2xx return model-friendly errors; result cap)

### Shell Exec Tool

- [x] exec tool with timeout and workspace restriction (cwd-pinned)
- [x] Dangerous command deny list
- [x] Approval hook (delegates confirmation to caller via `approveCommand`)
- [x] Output truncation for large results — opt-in via `exec.enabled` (default off)

### Apply Patch Tool

- [x] Unified diff-style file editing
- [x] Hunk matching and fallback (hint → exact scan → whitespace-insensitive)
- [x] Dry-run mode

### Config & Schema Validation

- [x] Adopt `zod` for config parsing
- [x] Validate `.mini-agent/config.json` on load with clear error messages
- [x] Surface missing/invalid `apiKey` early (config or `MINI_AGENT_API_KEY`)
- [ ] Reuse zod for tool parameter schemas — deliberately deferred: the
      hand-rolled validator in `src/tools/schema.ts` already returns
      model-friendly errors, and swapping it has a large blast radius

### Accurate Context Accounting

- [x] Replace `length / 4` with a pluggable `TokenCounter` (improved heuristic;
      a real vendor tokenizer is intentionally NOT bundled — DeepSeek's tokenizer
      differs from GPT's, so it would give false precision. Provider `usage` is
      the source of truth.)
- [x] Expose token `usage` through `RunResult` (AgentLoop no longer drops it)
- [x] Summarize compacted tool results instead of fully omitting them

### CLI / REPL

Surfaces the runtime additions so each feature is verifiable from the terminal.

- [x] `--stream` flag — print assistant tokens live via `AgentLoop.stream()`
- [x] `usage>` line reporting token usage after each turn
- [x] `Ctrl-C` aborts the in-flight turn (per-turn `AbortController`); idle exits
- [x] Clean `Config error:` message on invalid config instead of a stack trace
- [x] `/help`, `/tools`, `/tool <name> <json>` commands (`/tool` runs a tool with
      no model call — deterministic verification of apply_patch/exec/web_search)

## Phase 3 — Web UI

### Backend ✅

Completed as a local Node HTTP/WebSocket backend. The implementation uses Node's
native `http` server and a small WebSocket adapter, not Express.

- [x] HTTP/WebSocket server wrapping AgentLoop
- [x] REST API: sessions list, session history, session delete, config read/write
- [x] WebSocket: streaming agent events, turn rejection, abort, exec approval bridge
- [x] File system API: directory tree, file content reading
- [x] Static frontend build serving with SPA fallback

### Frontend

- [x] React + TypeScript + Tailwind scaffold
- [x] Chat interface with streaming text and collapsible tool/thinking chain
- [x] Session sidebar (list, switch, new session; search/delete deferred)
- [x] Workspace file browser with recursive tree and text preview
- [x] Settings view for provider, agent params, search, exec, and tools
- [x] Session history cache-consistency fix (2026-06-21: shared SessionManager
  between HTTP and WS — covered by `tests/server/session-sync.test.ts`)
- [ ] Claude-style UI redesign (user requested; design doc upcoming)
- [ ] Workspace file browser with syntax highlighting (Monaco Editor)
- [ ] Token usage and performance panel
- [ ] Dark/light theme

## Phase 4 — Architecture Depth

Stretch goals for resume differentiation.

- [ ] Multi-provider support (Anthropic Messages API)
- [ ] MCP (Model Context Protocol) client integration
- [ ] Subagent spawning for parallel task execution
- [ ] Provider retry with exponential backoff
- [ ] Tool concurrency for independent tool calls
