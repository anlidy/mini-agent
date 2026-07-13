# ADR-001: Transport-agnostic agent protocol

## Status

Accepted (2026-07-13)

## Context

The project had two independent entry points (CLI and WebSocket server) that each
built their own `AgentLoop`, `SessionManager`, and `ToolRegistry` wiring. There
was no explicit contract defining what operations the agent runtime exposes.
Adding a third consumer (e.g. TUI, VSCode plugin, or foreign-language client)
would require duplicating the same wiring logic a third time.

The project's narrative was also misaligned with its architecture: it described
itself as a "personal coding assistant," but the actual structure was a headless
agent runtime with multiple consumers.

## Decision

Define a transport-agnostic `AgentProtocol` interface and provide two transport
implementations:

1. **`AgentProtocol`** (`src/agent/protocol.ts`) — the single contract for agent
   runtime operations:
   - `runTurn(input, options)` → `AsyncIterable<AgentEvent>`
   - `abortTurn()`
   - `listSessions()`, `getSession()`, `deleteSession()`, `updateSession()`
   - `getToolDefinitions()`

2. **`DirectAgentClient`** (`src/client/DirectAgentClient.ts`) — in-process
   transport: wraps `Agent` + `SessionManager` + `ToolRegistry` behind
   `AgentProtocol`. Zero serialization, native TypeScript types.

3. The existing WebSocket handler (`src/server/wsHandler.ts`) is conceptually the
   second transport — it serializes the same protocol over JSON on a WebSocket
   connection.

The `Agent` interface (`src/agent/types.ts`) remains as a lower-level runtime
contract; `AgentProtocol` is the higher-level contract that includes session
management and tool discovery, making it suitable as a public API surface.

The project narrative was updated across README, AGENTS.md, PRODUCT.md, and
ARCHITECTURE.md to reflect the "agent runtime" identity.

## Alternatives considered

### No protocol layer, keep direct AgentLoop usage

CLI and server continue calling `AgentLoop.run()` / `.stream()` directly. Rejected
because it entangles session management with transport logic, and every new
consumer must replicate the wiring.

### Full client-server split from the start

Put every consumer behind a WebSocket connection, even the CLI. Rejected because
it adds latency and serialization overhead for the most common use case (local
terminal), and requires the server to always be running.

### gRPC or HTTP SSE as the protocol transport

Rejected as premature. The `AgentProtocol` interface is implementation-agnostic;
adding a new transport (gRPC, SSE, Unix socket) requires only a new implementation
of the contract, not a protocol redesign.

## Consequences

- New consumers (TUI, VSCode plugin, external scripts) can import `DirectAgentClient`
  and get a full agent runtime in one object.
- Foreign-language clients talk to the WebSocket server using the same logical
  protocol described by the `AgentProtocol` interface.
- `src/index.ts` now exports the full public surface, making `mini-agent` usable
  as an npm library.
- The architecture diagram now shows the protocol layer as the entry point,
  with transports branching below it.
