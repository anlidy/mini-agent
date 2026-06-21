# Phase 3 (Frontend) — Web UI Design

Status: design draft — based on approved visual direction v4.
Mockup: `docs/mockups/2026-06-20-web-ui-frontend-design-draft-v4.html`.
Scope source: `docs/ROADMAP.md` → Phase 3 Frontend.

## Product Direction

The Web UI is a local, single-user coding assistant workspace. The first screen is
the chat, not a dashboard. Sessions, files, settings, tools, config, and approvals
are available when needed, but none of them should compete with the conversation.

The approved direction is a chat-first layout:

- Left sidebar for sessions and secondary navigation.
- Centered, narrow main chat column.
- Lightweight right sidebar for workspace files.
- Inline execution chain for thinking/tool activity.
- Inline approval card for exec approvals.
- Settings as a secondary view, not a persistent panel.

Rejected directions:

- IDE-style three-pane layout: too heavy for a chat-first assistant.
- Terminal-only layout: clean, but hides sessions/files/settings too much.
- Persistent run-state sidebar: exposes low-value transient state and weakens the
  conversation hierarchy. The right sidebar is reserved for files, not runtime
  telemetry.

## Layout

Desktop uses one shell with three columns:

```text
┌─────────────────────────────────────────────────────────────────────────┐
│ mini-agent                                      /workspace/path          │
├───────────────┬───────────────────────────────────────┬────────────────┤
│ Sessions      │             centered chat              │ Files          │
│ Search        │     user / assistant messages          │ File tree      │
│ Session list  │     collapsible execution chain        │ Read-only      │
│               │     inline approval card               │ context        │
│ Settings      │     composer                           │                │
└───────────────┴───────────────────────────────────────┴────────────────┘
```

Main width targets:

- App shell max width: about `1280px`.
- Session sidebar: about `220px`.
- Files sidebar: about `240px`.
- Chat column: about `700px`, centered within the remaining space.
- On narrow screens, hide sidebars and keep the chat column full width with compact
  top navigation.

The top bar is intentionally quiet. It shows brand and workspace path only. Actions
such as new session and settings belong in the left sidebar. Files are visible in
the right sidebar on desktop.

## Visual Style

The interface should feel like a focused local workbench: calm, precise, and
readable. It should not look like a marketing page, a metrics console, or a full IDE.

Tokens from the v4 mockup:

| Role | Value |
|---|---|
| Background | `#f6f7f5` |
| Surface | `#ffffff` |
| Text | `#30353b` |
| Muted text | `#6f7781` |
| Border | `#e1e5e2` |
| Accent | `#315fbd` |
| User message background | `#edf3ff` |
| Approval background | `#fff6df` |
| Radius | `8px` for messages, chain, cards, and controls |

Typography:

- Use the app's default sans stack for UI and message text.
- Use a monospace stack only for labels, paths, tags, tool names, and code.
- Keep labels small and functional; avoid decorative headings inside the chat.

Visual rules:

- Do not add a persistent right inspector or run-state panel. The right column is
  only for workspace files.
- Do not show transient states like "streaming" or "stop" as standalone UI.
- Avoid large nested cards. Execution details should feel like part of the message
  stream, not a dashboard inside the chat.
- Keep both sidebars visually lighter than the chat column.

## Core Components

### AppShell

Owns the desktop frame: top bar, session sidebar, main chat region, and files
sidebar. It should not own agent runtime state beyond layout-level selection such
as the active session, selected file, and current secondary view.

### SessionSidebar

Responsibilities:

- List sessions from `GET /api/sessions`.
- Search/filter session summaries locally.
- Switch active session.
- Create a new session key.
- Delete a session after confirmation.
- Expose the secondary Settings navigation entry.

The sidebar is the home for "New session"; the top-right app chrome should not carry
that action.

### ChatThread

Responsibilities:

- Render saved session messages from `GET /api/sessions/:key`.
- Append live WebSocket events during the active turn.
- Render assistant tokens as one streaming assistant message.
- Render execution activity through `ExecutionChain`.
- Render `ApprovalCard` inline when the server sends `approve_request`.
- Render errors as inline messages with actionable text.

The thread should preserve the natural reading order:

```text
user message
assistant message / streaming content
execution chain if tools or thinking are present
approval card if user input is required
assistant continuation / final answer
```

### ExecutionChain

The execution chain is a parent collapsible block. It appears only when a turn has
thinking/tool activity worth showing.

Parent summary:

```text
Execution chain    4 steps
```

Child steps are also collapsible. Step labels use compact monospace tags:

- `[thinking]` for agent reasoning summaries or planning notes.
- `[tool]` for tool calls and tool results.

Each child summary includes:

- tag (`[thinking]` or `[tool]`)
- short title (`read_file docs/ROADMAP.md`, `apply_patch ...`)
- small status text (`ok`, `error`, `approval`, `done`)

Expanded child detail includes only useful details:

- tool arguments when helpful
- truncated output or result summary
- error text and recovery hints

Do not render every token-level or lifecycle state. The chain is for debugging and
trust, not telemetry.

### ApprovalCard

Exec approvals appear inline in the chat stream, not as a modal and not in a side
panel.

Card content:

- title: `Approve command?`
- short explanation: command will run in the current workspace
- command text in monospace
- `Approve` and `Deny` buttons

Behavior:

- On approve: send `approve_command { id, approved: true }`.
- On deny: send `approve_command { id, approved: false }`.
- Once answered, replace buttons with a compact resolved state.
- If the WebSocket closes or the approval expires, show a resolved "expired" state.

### Composer

The composer sits at the bottom of the centered chat column.

Requirements:

- Multiline input.
- Send on Enter.
- Newline on Shift+Enter.
- Abort control only while a turn is active, shown near the composer or in the chat
  header as a minimal control.
- Disable sending while a turn is active on that WebSocket connection.
- If the backend returns `turn_rejected`, show an inline notice and keep draft text.

### FilesSidebar

Files are visible on the main desktop screen as a lightweight right sidebar. It uses:

- `GET /api/files/tree?path=...`
- `GET /api/files/content?path=...`

Responsibilities:

- Show a compact workspace file tree.
- Load file content when a file is selected.
- Render a small read-only preview or open a larger read-only file view when the
  content is too large for the sidebar.
- Keep path errors local to the files sidebar.

First implementation can use a read-only code viewer in the sidebar. Monaco is still
the preferred target from the roadmap, but file browsing remains supporting context,
not the primary work surface.

### Settings View

Settings are a secondary view opened from the sidebar. It uses:

- `GET /api/config`
- `PUT /api/config`
- `GET /api/tools`

Settings sections:

- Provider: name, base URL, model, API key.
- Agent: max iterations, context window, tool result size.
- Search: backend and max results.
- Exec: enabled, timeout, max output chars.

The API key field must respect backend redaction. If the current value is `***`, the
client may submit `***` to preserve the stored key.

## Data Flow

Initial load:

1. Load config and tools for settings/status needs.
2. Load session list.
3. Select the configured/default session if present, otherwise create/select a new
   session key.
4. Load full session history.
5. Open WebSocket: `/ws?session=<key>`.

Turn flow:

1. User sends text with `user_message`.
2. Client appends the user message optimistically.
3. Token events update the active assistant message.
4. Tool events update the active `ExecutionChain`.
5. `approve_request` inserts an inline `ApprovalCard`.
6. `done` finalizes the assistant message and refreshes session summary metadata.
7. `error` renders inline and leaves the session usable.

Session switch:

1. Close the current WebSocket.
2. Load the selected session history.
3. Open a new WebSocket bound to the selected key.

## Error Handling

REST errors use `{ error }`; render the message directly with context-specific
recovery actions.

WebSocket errors:

- `error`: show inline in chat.
- `turn_rejected`: keep the input draft and explain that a turn is already active.
- connection close during active turn: mark the in-progress assistant turn as
  interrupted.

File errors:

- Path escape or missing file should stay in the Files view and not interrupt chat.

Settings errors:

- Validation errors should stay attached to the relevant form section.

## Testing

Frontend tests should focus on state transitions and protocol handling:

- Session list renders and session switch reloads history.
- Sending a message opens a turn and appends streamed tokens.
- Tool events create/update a collapsible execution chain.
- Child `[thinking]` and `[tool]` steps expand/collapse independently.
- Approval card sends approve/deny messages and resolves state.
- `turn_rejected`, `error`, and connection close render usable inline states.
- Config redaction round-trip preserves `***`.
- Files view rejects path errors without breaking chat.

Visual/manual checks:

- Desktop layout at roughly 1440px and 1180px widths.
- Mobile/narrow layout with sidebar hidden.
- Long tool names and long commands do not overflow.
- Reduced motion does not break streaming readability.

## Out of Scope For First Frontend Pass

- Editing files directly from the Files view.
- Multi-user auth or remote deployment concerns.
- Diff review UI.
- Full telemetry/performance dashboards.
- Multiple simultaneous active turns in one connection.
