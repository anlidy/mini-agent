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

## Phase 2 — Runtime Enhancements (current)

Core improvements needed before building the Web UI.

### Streaming Support

- [ ] Add `chatStream()` to LLMProvider interface
- [ ] Implement SSE parsing in OpenAIProvider
- [ ] Add streaming mode to AgentRunner with token-level events
- [ ] Agent interface: add `stream()` method alongside existing `run()`

### Abort / Cancel

- [ ] Expose AbortController from AgentLoop
- [ ] Wire abort signal through to provider HTTP requests
- [ ] Graceful stop — exit iteration loop cleanly on abort

### Agent Event API

- [ ] Define event types: `token`, `tool_call`, `tool_result`, `done`, `error`
- [ ] Agent.stream() returns AsyncIterable<AgentEvent>
- [ ] Backward-compatible: existing `run()` unchanged

### Real Web Search

- [ ] Integrate DuckDuckGo or Brave Search API
- [ ] Configurable search backend via config.json
- [ ] Rate limiting and error handling

### Shell Exec Tool

- [ ] exec tool with timeout and workspace restriction
- [ ] Dangerous command deny list
- [ ] Approval hook (delegates confirmation to caller — CLI or Web UI)
- [ ] Output truncation for large results

### Apply Patch Tool

- [ ] Unified diff-style file editing
- [ ] Hunk matching and fallback
- [ ] Dry-run mode

### Config & Schema Validation

- [ ] Adopt `zod` for config parsing (dependency is already installed but unused)
- [ ] Validate `.mini-agent/config.json` on load with clear error messages
- [ ] Surface missing/invalid `apiKey` early instead of failing at first request
- [ ] Consider reusing zod for tool parameter schemas (currently hand-rolled in `src/tools/schema.ts`)

### Accurate Context Accounting

- [ ] Replace the `length / 4` token heuristic with a real tokenizer
- [ ] Expose token `usage` through `RunResult` (AgentRunner already accumulates it; AgentLoop drops it)
- [ ] Summarize compacted tool results instead of fully omitting them

## Phase 3 — Web UI

### Backend

- [ ] Express/WebSocket server wrapping AgentLoop
- [ ] REST API: sessions list, session history, config read/write
- [ ] WebSocket: streaming agent events, real-time tool call display
- [ ] File system API: directory tree, file content reading

### Frontend

- [ ] React + TypeScript + shadcn/ui + Tailwind
- [ ] Chat interface with streaming text and tool call cards
- [ ] Session sidebar (list, search, switch, delete)
- [ ] Workspace file browser with syntax highlighting (Monaco Editor)
- [ ] Config panel (provider, agent params)
- [ ] Token usage and performance panel
- [ ] Dark/light theme

## Phase 4 — Architecture Depth

Stretch goals for resume differentiation.

- [ ] Multi-provider support (Anthropic Messages API)
- [ ] MCP (Model Context Protocol) client integration
- [ ] Subagent spawning for parallel task execution
- [ ] Provider retry with exponential backoff
- [ ] Tool concurrency for independent tool calls
