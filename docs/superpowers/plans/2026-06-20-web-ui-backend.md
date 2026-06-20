# Web UI Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the local HTTP/WebSocket backend that exposes the existing agent runtime to a future browser UI.

**Architecture:** Add a new `src/server/` driver layer that owns HTTP routing, static serving, and WebSocket protocol translation. Keep `AgentLoop` as the runtime entry point; add only narrow runtime extension points for session listing/deletion, config writes, and command approval.

**Tech Stack:** TypeScript, Node `http`, built-in filesystem APIs, Vitest, browser-compatible WebSocket protocol.

---

### Task 1: Runtime APIs

**Files:**
- Modify: `src/session/SessionManager.ts`
- Modify: `src/config/loadConfig.ts`
- Test: `tests/session/session-manager.test.ts`
- Test: `tests/config/write-config.test.ts`

- [ ] Add failing tests for `listSessions()`, `deleteSession()`, and redaction-preserving `writeConfig()`.
- [ ] Implement session summaries by scanning JSONL session files.
- [ ] Implement session deletion as an idempotent file/cache removal.
- [ ] Implement atomic config writes that preserve stored API keys when the caller submits the redaction sentinel.
- [ ] Run the focused runtime tests.

### Task 2: HTTP Server

**Files:**
- Create: `src/server/httpRouter.ts`
- Create: `src/server/routes/config.ts`
- Create: `src/server/routes/files.ts`
- Create: `src/server/routes/sessions.ts`
- Create: `src/server/routes/tools.ts`
- Create: `src/server/static.ts`
- Create: `src/server/index.ts`
- Test: `tests/server/http-router.test.ts`
- Test: `tests/server/rest.test.ts`

- [ ] Add failing tests for method/path routing, sessions, config redaction/write, tools, file content/tree, and path escape errors.
- [ ] Implement the minimal JSON router and uniform `{ "error": string }` failures.
- [ ] Implement REST routes using only public runtime/tool APIs.
- [ ] Implement static serving with SPA fallback when a frontend build directory exists.
- [ ] Run the focused server REST tests.

### Task 3: WebSocket Protocol

**Files:**
- Create: `src/server/protocol.ts`
- Create: `src/server/wsHandler.ts`
- Modify: `src/agent/types.ts`
- Modify: `src/agent/AgentLoop.ts`
- Modify: `src/agent/AgentRunner.ts`
- Test: `tests/server/ws.test.ts`

- [ ] Add failing tests for session binding, streamed tokens/done, turn rejection, abort, and exec approval.
- [ ] Add a narrow `approveCommand` runtime option passed from `AgentLoop` to `AgentRunner`.
- [ ] Implement per-connection state, pending approvals, active-turn rejection, abort handling, and config-version rebuilds.
- [ ] Run the focused WebSocket tests.

### Task 4: Entrypoint and Verification

**Files:**
- Create: `src/server.ts`
- Modify: `src/index.ts`
- Modify: `package.json`

- [ ] Add the server executable entry and public exports.
- [ ] Run `npm test`.
- [ ] Run `npm run typecheck`.
- [ ] Run `npm run build`.
