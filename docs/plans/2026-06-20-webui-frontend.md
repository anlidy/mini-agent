# Web UI Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the React Web UI for the local mini-agent server: chat-first workspace, sessions sidebar, right files sidebar, inline execution chain, inline exec approvals, and secondary settings screen.

**Architecture:** Create a standalone `webui/` Vite React app whose production build emits `dist/webui`, matching the backend static serving path. Keep browser protocol code in small client modules, UI state in focused hooks, and UI components split by product responsibility. The backend remains unchanged except for optional docs/package script updates.

**Tech Stack:** React, TypeScript, Vite, Tailwind CSS, shadcn/ui conventions, lucide-react icons, Vitest, Testing Library.

---

## Source Design

- Spec: `docs/specs/2026-06-20-webui-frontend-design.md`
- Mockup: `docs/mockups/2026-06-20-webui-frontend-design-draft-v4.html`
- Backend API: `README.md` → Web UI Backend
- Protocol types: `src/server/protocol.ts`, `src/agent/events.ts`

## File Structure

```text
webui/
  package.json
  index.html
  tsconfig.json
  tsconfig.node.json
  vite.config.ts
  postcss.config.js
  tailwind.config.ts
  src/
    main.tsx
    App.tsx
    styles.css
    api/
      http.ts
      types.ts
      ws.ts
    hooks/
      useAgentSocket.ts
      useSessions.ts
      useFiles.ts
      useConfig.ts
    components/
      AppShell.tsx
      SessionSidebar.tsx
      FilesSidebar.tsx
      ChatThread.tsx
      ExecutionChain.tsx
      ApprovalCard.tsx
      Composer.tsx
      SettingsView.tsx
      ui/
        button.tsx
        input.tsx
        textarea.tsx
        dialog.tsx
        tabs.tsx
        scroll-area.tsx
    test/
      server.ts
      setup.ts
```

Root project updates:

```text
package.json        add frontend scripts only if useful from root
README.md          add Web UI frontend dev/build commands
docs/ROADMAP.md    mark frontend plan/design status as in progress after implementation starts
```

## Task 1: Scaffold `webui`

**Files:**
- Create: `webui/package.json`
- Create: `webui/index.html`
- Create: `webui/tsconfig.json`
- Create: `webui/tsconfig.node.json`
- Create: `webui/vite.config.ts`
- Create: `webui/postcss.config.js`
- Create: `webui/tailwind.config.ts`
- Create: `webui/src/main.tsx`
- Create: `webui/src/App.tsx`
- Create: `webui/src/styles.css`
- Create: `webui/src/test/setup.ts`
- Modify: `package.json`

- [x] **Step 1: Create frontend package metadata**

Create `webui/package.json`:

```json
{
  "name": "mini-agent-webui",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite --host 127.0.0.1",
    "build": "tsc -b && vite build",
    "preview": "vite preview --host 127.0.0.1",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@vitejs/plugin-react": "latest",
    "class-variance-authority": "latest",
    "clsx": "latest",
    "lucide-react": "latest",
    "react": "latest",
    "react-dom": "latest",
    "tailwind-merge": "latest"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "latest",
    "@testing-library/react": "latest",
    "@testing-library/user-event": "latest",
    "@types/react": "latest",
    "@types/react-dom": "latest",
    "autoprefixer": "latest",
    "jsdom": "latest",
    "postcss": "latest",
    "tailwindcss": "latest",
    "typescript": "latest",
    "vite": "latest",
    "vitest": "latest"
  }
}
```

- [x] **Step 2: Install frontend dependencies**

Run:

```bash
cd webui
npm install
```

Expected: `webui/package-lock.json` is created and install exits `0`.

Result on 2026-06-21: `npm --prefix webui install` completed, created
`webui/package-lock.json`, audited 195 packages, and reported 0
vulnerabilities.

- [x] **Step 3: Add Vite and TypeScript config**

Create `webui/vite.config.ts`:

```ts
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 5173,
    proxy: {
      "/api": "http://127.0.0.1:3210",
      "/ws": {
        target: "ws://127.0.0.1:3210",
        ws: true
      }
    }
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"]
  }
});
```

Create `webui/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "lib": ["DOM", "DOM.Iterable", "ES2022"],
    "allowJs": false,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "strict": true,
    "forceConsistentCasingInFileNames": true,
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx"
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

Create `webui/tsconfig.node.json`:

```json
{
  "compilerOptions": {
    "composite": true,
    "skipLibCheck": true,
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "allowSyntheticDefaultImports": true
  },
  "include": ["vite.config.ts", "tailwind.config.ts"]
}
```

- [x] **Step 4: Add Tailwind config and global CSS**

Create `webui/tailwind.config.ts`:

```ts
import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        background: "#f6f7f5",
        surface: "#ffffff",
        ink: "#17191d",
        text: "#30353b",
        muted: "#6f7781",
        line: "#e1e5e2",
        accent: "#315fbd",
        "accent-soft": "#edf3ff",
        "approval-soft": "#fff6df",
        green: "#2d7a58",
        red: "#b42318"
      },
      borderRadius: {
        ui: "8px"
      },
      fontFamily: {
        mono: ["SFMono-Regular", "Cascadia Code", "Roboto Mono", "Consolas", "monospace"]
      }
    }
  },
  plugins: []
} satisfies Config;
```

Create `webui/postcss.config.js`:

```js
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {}
  }
};
```

Create `webui/src/styles.css`:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  color: #30353b;
  background: #f6f7f5;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  min-width: 320px;
  min-height: 100vh;
}

button,
input,
textarea {
  font: inherit;
}
```

- [x] **Step 5: Add initial React entry**

Create `webui/index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>mini-agent</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

Create `webui/src/main.tsx`:

```tsx
import React from "react";
import ReactDOM from "react-dom/client";

import App from "./App";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

Create `webui/src/App.tsx`:

```tsx
export default function App(): JSX.Element {
  return <div className="min-h-screen bg-background text-text">mini-agent</div>;
}
```

Create `webui/src/test/setup.ts`:

```ts
import "@testing-library/jest-dom/vitest";
```

- [x] **Step 6: Add root scripts**

Modify root `package.json` scripts:

```json
{
  "web:dev": "npm --prefix webui run dev",
  "web:build": "npm --prefix webui run build",
  "web:test": "npm --prefix webui run test"
}
```

Keep existing root scripts unchanged.

- [x] **Step 7: Verify scaffold**

Run:

```bash
npm --prefix webui run build
npm --prefix webui run test
```

Expected: build exits `0`; test exits `0` with no tests or a passing empty suite.

Result on 2026-06-21: scaffold was later covered by the full frontend test and
build runs after dependencies were installed.

- [x] **Step 8: Commit**

```bash
git add package.json webui
git commit -m "feat(webui): scaffold React frontend"
```

Result on 2026-06-21: included in final frontend implementation commit.

## Task 2: Add API Types And HTTP Client

**Files:**
- Create: `webui/src/api/types.ts`
- Create: `webui/src/api/http.ts`
- Test: `webui/src/api/http.test.ts`

- [x] **Step 1: Define browser-facing API types**

Create `webui/src/api/types.ts`:

```ts
export interface SessionSummary {
  key: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  preview: string;
}

export interface MessageRecord {
  role: string;
  content: unknown;
  tool_call_id?: string;
  name?: string;
  tool_calls?: unknown;
  timestamp: string;
}

export interface Session {
  key: string;
  messages: MessageRecord[];
  createdAt: string;
  updatedAt: string;
  metadata: Record<string, unknown>;
}

export interface FileTreeNode {
  name: string;
  path: string;
  type: "file" | "directory";
  size?: number;
  children?: FileTreeNode[];
}

export interface FileContent {
  path: string;
  content: string;
}

export interface Config {
  workspace: string;
  provider: {
    name?: string;
    apiKey?: string;
    baseUrl?: string;
    model?: string;
    timeoutMs?: number;
  };
  agent: {
    maxIterations: number;
    maxToolResultChars: number;
    contextWindowTokens?: number;
  };
  sessions: {
    dir: string;
    defaultKey: string;
    maxHistoryMessages: number;
    maxHistoryChars: number;
  };
  search?: {
    backend: "duckduckgo" | "none";
    maxResults: number;
  };
  exec?: {
    enabled: boolean;
    timeoutMs: number;
    maxOutputChars: number;
  };
}

export interface ToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}
```

- [x] **Step 2: Write HTTP client tests**

Create `webui/src/api/http.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";

import { apiDelete, apiGet, apiPut } from "./http";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("http api helpers", () => {
  it("parses JSON responses", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "content-type": "application/json" }
    })));

    await expect(apiGet<{ ok: boolean }>("/api/test")).resolves.toEqual({ ok: true });
  });

  it("throws backend error messages", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "bad config" }), {
      status: 400,
      headers: { "content-type": "application/json" }
    })));

    await expect(apiGet("/api/config")).rejects.toThrow("bad config");
  });

  it("sends PUT bodies as JSON", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ saved: true }), {
      status: 200,
      headers: { "content-type": "application/json" }
    }));
    vi.stubGlobal("fetch", fetchMock);

    await apiPut("/api/config", { provider: { model: "x" } });

    expect(fetchMock).toHaveBeenCalledWith("/api/config", expect.objectContaining({
      method: "PUT",
      body: JSON.stringify({ provider: { model: "x" } })
    }));
  });

  it("handles 204 delete responses", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 204 })));

    await expect(apiDelete("/api/sessions/demo")).resolves.toBeUndefined();
  });
});
```

- [x] **Step 3: Implement HTTP helpers**

Create `webui/src/api/http.ts`:

```ts
export async function apiGet<T>(path: string): Promise<T> {
  return request<T>(path, { method: "GET" });
}

export async function apiPut<T>(path: string, body: unknown): Promise<T> {
  return request<T>(path, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
}

export async function apiDelete(path: string): Promise<void> {
  await request<void>(path, { method: "DELETE" });
}

async function request<T>(path: string, init: RequestInit): Promise<T> {
  const response = await fetch(path, init);
  if (response.status === 204) {
    return undefined as T;
  }

  const text = await response.text();
  const data = text ? JSON.parse(text) as unknown : undefined;

  if (!response.ok) {
    const error = data && typeof data === "object" && "error" in data
      ? String((data as { error: unknown }).error)
      : `Request failed with ${response.status}`;
    throw new Error(error);
  }

  return data as T;
}
```

- [x] **Step 4: Verify HTTP client**

Run:

```bash
npm --prefix webui run test -- src/api/http.test.ts
```

Expected: all HTTP helper tests pass.

Result on 2026-06-21: covered by the full frontend test run, which passed.

- [x] **Step 5: Commit**

```bash
git add webui/src/api
git commit -m "feat(webui): add REST API client"
```

Result on 2026-06-21: included in final frontend implementation commit.

## Task 3: Add WebSocket Client And Event Model

**Files:**
- Create: `webui/src/api/ws.ts`
- Test: `webui/src/api/ws.test.ts`

- [x] **Step 1: Define WebSocket event types and client**

Create `webui/src/api/ws.ts`:

```ts
export type ClientMessage =
  | { type: "user_message"; text: string }
  | { type: "abort" }
  | { type: "approve_command"; id: string; approved: boolean };

export type AgentDoneResult = {
  finalContent: string | null;
  messages: Array<Record<string, unknown>>;
  toolsUsed: string[];
  usage: Record<string, number>;
  stopReason: "completed" | "max_iterations" | "error" | "aborted";
  error?: string;
  toolEvents: Array<{ name: string; status: "ok" | "error"; detail: string }>;
};

export type ServerMessage =
  | { type: "session"; key: string }
  | { type: "token"; text: string }
  | { type: "tool_call"; id: string; name: string; arguments: Record<string, unknown> }
  | { type: "tool_result"; id: string; name: string; status: "ok" | "error"; content: string }
  | { type: "done"; result: AgentDoneResult }
  | { type: "error"; error: string }
  | { type: "approve_request"; id: string; command: string }
  | { type: "turn_rejected"; reason: string };

export interface AgentSocket {
  send(message: ClientMessage): void;
  close(): void;
}

export function createAgentSocket(
  sessionKey: string,
  handlers: {
    onMessage(message: ServerMessage): void;
    onOpen?(): void;
    onClose?(): void;
    onError?(error: Event): void;
  }
): AgentSocket {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const socket = new WebSocket(`${protocol}//${window.location.host}/ws?session=${encodeURIComponent(sessionKey)}`);

  socket.addEventListener("open", () => handlers.onOpen?.());
  socket.addEventListener("message", (event) => {
    handlers.onMessage(JSON.parse(String(event.data)) as ServerMessage);
  });
  socket.addEventListener("close", () => handlers.onClose?.());
  socket.addEventListener("error", (event) => handlers.onError?.(event));

  return {
    send(message) {
      socket.send(JSON.stringify(message));
    },
    close() {
      socket.close();
    }
  };
}
```

- [x] **Step 2: Add a focused URL construction test**

Create `webui/src/api/ws.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";

import { createAgentSocket } from "./ws";

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  readonly listeners = new Map<string, Array<(event: unknown) => void>>();

  constructor(readonly url: string) {
    FakeWebSocket.instances.push(this);
  }

  addEventListener(type: string, listener: (event: unknown) => void): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }

  send = vi.fn();
  close = vi.fn();
}

describe("createAgentSocket", () => {
  it("connects to the current host with encoded session key", () => {
    vi.stubGlobal("WebSocket", FakeWebSocket);
    window.history.pushState(null, "", "http://127.0.0.1:5173/");

    createAgentSocket("default session", { onMessage: vi.fn() });

    expect(FakeWebSocket.instances[0]?.url).toBe("ws://127.0.0.1:5173/ws?session=default%20session");
  });
});
```

- [x] **Step 3: Verify WebSocket client**

Run:

```bash
npm --prefix webui run test -- src/api/ws.test.ts
```

Expected: WebSocket client test passes.

Result on 2026-06-21: covered by the full frontend test run, which passed. Spec
review also corrected `AgentDoneResult` to match the backend `AgentRunResult`
shape.

- [x] **Step 4: Commit**

```bash
git add webui/src/api/ws.ts webui/src/api/ws.test.ts
git commit -m "feat(webui): add websocket client"
```

Result on 2026-06-21: included in final frontend implementation commit.

## Task 4: Build App Shell, Sidebar, And Files Sidebar

**Files:**
- Create: `webui/src/components/AppShell.tsx`
- Create: `webui/src/components/SessionSidebar.tsx`
- Create: `webui/src/components/FilesSidebar.tsx`
- Modify: `webui/src/App.tsx`
- Test: `webui/src/components/AppShell.test.tsx`

- [x] **Step 1: Write layout test**

Create `webui/src/components/AppShell.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import AppShell from "./AppShell";

describe("AppShell", () => {
  it("renders sessions, centered chat, and files regions", () => {
    render(
      <AppShell
        sessionSidebar={<div>Sessions region</div>}
        filesSidebar={<div>Files region</div>}
        onOpenSettings={vi.fn()}
      >
        <div>Chat region</div>
      </AppShell>
    );

    expect(screen.getByText("mini-agent")).toBeInTheDocument();
    expect(screen.getByText("Sessions region")).toBeInTheDocument();
    expect(screen.getByText("Chat region")).toBeInTheDocument();
    expect(screen.getByText("Files region")).toBeInTheDocument();
  });
});
```

- [x] **Step 2: Implement app shell**

Create `webui/src/components/AppShell.tsx`:

```tsx
import { Settings } from "lucide-react";
import type { ReactNode } from "react";

interface AppShellProps {
  sessionSidebar: ReactNode;
  filesSidebar: ReactNode;
  children: ReactNode;
  onOpenSettings(): void;
}

export default function AppShell({ sessionSidebar, filesSidebar, children, onOpenSettings }: AppShellProps): JSX.Element {
  return (
    <div className="min-h-screen bg-background px-5 py-7 text-text">
      <div className="mx-auto max-w-[1280px] overflow-hidden rounded-[12px] border border-[#d4dad6] bg-surface shadow-[0_24px_70px_rgba(30,35,42,0.10)]">
        <header className="grid min-h-[52px] grid-cols-[220px_minmax(0,1fr)_240px] items-center gap-3 border-b border-line px-[15px] max-lg:grid-cols-1">
          <div className="flex items-center gap-2.5 font-bold text-ink">
            <div className="grid h-7 w-7 place-items-center rounded-[7px] bg-ink font-mono text-[11px] font-bold text-white">ma</div>
            <span>mini-agent</span>
          </div>
          <div className="truncate font-mono text-xs text-muted max-lg:hidden">{window.location.pathname || "/"}</div>
          <button className="hidden h-8 w-8 place-items-center rounded-ui border border-line bg-white text-text max-lg:grid" onClick={onOpenSettings} aria-label="Open settings">
            <Settings size={15} />
          </button>
        </header>
        <div className="grid min-h-[746px] grid-cols-[220px_minmax(0,1fr)_240px] max-lg:grid-cols-1">
          <aside className="border-r border-line bg-[#fafbf9] max-lg:hidden">{sessionSidebar}</aside>
          <main className="min-w-0 bg-surface">{children}</main>
          <aside className="border-l border-line bg-[#fafbf9] max-lg:hidden">{filesSidebar}</aside>
        </div>
      </div>
    </div>
  );
}
```

- [x] **Step 3: Implement placeholder sidebars**

Create `webui/src/components/SessionSidebar.tsx`:

```tsx
import { Plus, Settings } from "lucide-react";

import type { SessionSummary } from "../api/types";

interface SessionSidebarProps {
  sessions: SessionSummary[];
  activeKey: string;
  onSelect(key: string): void;
  onNew(): void;
  onOpenSettings(): void;
}

export default function SessionSidebar({ sessions, activeKey, onSelect, onNew, onOpenSettings }: SessionSidebarProps): JSX.Element {
  return (
    <div className="relative min-h-[746px]">
      <div className="flex h-12 items-center justify-between px-3 text-xs font-bold uppercase text-muted">
        <span>Sessions</span>
        <button className="grid h-[30px] w-[30px] place-items-center rounded-[7px] border border-line bg-white" onClick={onNew} aria-label="New session">
          <Plus size={14} />
        </button>
      </div>
      <div className="mx-3 mb-2.5 rounded-[7px] bg-white px-2.5 py-2 text-[13px] text-[#9aa2aa] shadow-[inset_0_0_0_1px_#e1e5e2]">Search sessions</div>
      <div className="px-2">
        {sessions.map((session) => (
          <button
            key={session.key}
            className={`mb-1 w-full rounded-ui p-2.5 text-left text-xs leading-relaxed ${session.key === activeKey ? "bg-white text-text shadow-[inset_0_0_0_1px_#e1e5e2]" : "text-muted"}`}
            onClick={() => onSelect(session.key)}
          >
            <strong className="mb-1 flex justify-between gap-2 text-[13px]">
              <span>{session.key}</span>
              <span>{session.messageCount}</span>
            </strong>
            <span>{session.preview}</span>
          </button>
        ))}
      </div>
      <div className="absolute bottom-3 left-3 right-3">
        <button className="flex h-8 items-center gap-2 rounded-[7px] px-2 text-xs text-muted" onClick={onOpenSettings}>
          <Settings size={14} /> Settings
        </button>
      </div>
    </div>
  );
}
```

Create `webui/src/components/FilesSidebar.tsx`:

```tsx
import { RefreshCw } from "lucide-react";

import type { FileTreeNode } from "../api/types";

interface FilesSidebarProps {
  tree?: FileTreeNode;
  selectedPath?: string;
  onSelect(path: string): void;
  onRefresh(): void;
}

export default function FilesSidebar({ tree, selectedPath, onSelect, onRefresh }: FilesSidebarProps): JSX.Element {
  const children = tree?.children ?? [];
  return (
    <div>
      <div className="flex h-12 items-center justify-between px-3 text-xs font-bold uppercase text-muted">
        <span>Files</span>
        <button className="grid h-[30px] w-[30px] place-items-center rounded-[7px] border border-line bg-white" onClick={onRefresh} aria-label="Refresh files">
          <RefreshCw size={14} />
        </button>
      </div>
      <div className="mx-3 mb-2.5 rounded-[7px] bg-white px-2.5 py-2 text-[13px] text-[#9aa2aa] shadow-[inset_0_0_0_1px_#e1e5e2]">Filter files</div>
      <div className="px-2.5">
        {children.map((node) => (
          <button
            key={node.path}
            className={`grid min-h-7 w-full grid-cols-[18px_minmax(0,1fr)] items-center gap-2 rounded-[7px] px-2 text-left font-mono text-xs ${node.path === selectedPath ? "bg-white text-text shadow-[inset_0_0_0_1px_#e1e5e2]" : "text-muted"}`}
            onClick={() => onSelect(node.path)}
          >
            <span>{node.type === "directory" ? "d" : "f"}</span>
            <span className="truncate">{node.path}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
```

- [x] **Step 4: Wire shell into App**

Modify `webui/src/App.tsx`:

```tsx
import AppShell from "./components/AppShell";
import FilesSidebar from "./components/FilesSidebar";
import SessionSidebar from "./components/SessionSidebar";

const demoSessions = [
  { key: "default", createdAt: "", updatedAt: "", messageCount: 3, preview: "Chat-first Web UI" }
];

const demoTree = {
  name: ".",
  path: ".",
  type: "directory" as const,
  children: [
    { name: "src", path: "src", type: "directory" as const },
    { name: "README.md", path: "README.md", type: "file" as const }
  ]
};

export default function App(): JSX.Element {
  return (
    <AppShell
      sessionSidebar={<SessionSidebar sessions={demoSessions} activeKey="default" onSelect={() => undefined} onNew={() => undefined} onOpenSettings={() => undefined} />}
      filesSidebar={<FilesSidebar tree={demoTree} selectedPath="README.md" onSelect={() => undefined} onRefresh={() => undefined} />}
      onOpenSettings={() => undefined}
    >
      <div className="mx-auto min-h-[746px] w-full max-w-[700px] py-7">Chat region</div>
    </AppShell>
  );
}
```

- [x] **Step 5: Verify shell**

Run:

```bash
npm --prefix webui run test -- src/components/AppShell.test.tsx
npm --prefix webui run build
```

Expected: test and build pass.

Result on 2026-06-21: covered by the full frontend test and build runs, which
passed. Spec review passed.

- [x] **Step 6: Commit**

```bash
git add webui/src/App.tsx webui/src/components
git commit -m "feat(webui): add chat-first app shell"
```

Result on 2026-06-21: included in final frontend implementation commit.

## Task 5: Implement Session And File Hooks

**Files:**
- Create: `webui/src/hooks/useSessions.ts`
- Create: `webui/src/hooks/useFiles.ts`
- Test: `webui/src/hooks/useSessions.test.tsx`
- Test: `webui/src/hooks/useFiles.test.tsx`

- [x] **Step 1: Implement session hook**

Create `webui/src/hooks/useSessions.ts`:

```ts
import { useCallback, useEffect, useState } from "react";

import { apiDelete, apiGet } from "../api/http";
import type { Session, SessionSummary } from "../api/types";

export function useSessions(defaultKey = "default") {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [activeKey, setActiveKey] = useState(defaultKey);
  const [activeSession, setActiveSession] = useState<Session | undefined>();
  const [error, setError] = useState<string | undefined>();

  const refresh = useCallback(async () => {
    try {
      setSessions(await apiGet<SessionSummary[]>("/api/sessions"));
      setError(undefined);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }, []);

  const loadSession = useCallback(async (key: string) => {
    setActiveKey(key);
    try {
      setActiveSession(await apiGet<Session>(`/api/sessions/${encodeURIComponent(key)}`));
      setError(undefined);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }, []);

  const deleteSession = useCallback(async (key: string) => {
    await apiDelete(`/api/sessions/${encodeURIComponent(key)}`);
    await refresh();
    if (key === activeKey) {
      await loadSession(defaultKey);
    }
  }, [activeKey, defaultKey, loadSession, refresh]);

  useEffect(() => {
    void refresh();
    void loadSession(defaultKey);
  }, [defaultKey, loadSession, refresh]);

  return { sessions, activeKey, activeSession, error, refresh, loadSession, deleteSession };
}
```

- [x] **Step 2: Implement file hook**

Create `webui/src/hooks/useFiles.ts`:

```ts
import { useCallback, useEffect, useState } from "react";

import { apiGet } from "../api/http";
import type { FileContent, FileTreeNode } from "../api/types";

export function useFiles() {
  const [tree, setTree] = useState<FileTreeNode | undefined>();
  const [selected, setSelected] = useState<FileContent | undefined>();
  const [error, setError] = useState<string | undefined>();

  const refreshTree = useCallback(async () => {
    try {
      setTree(await apiGet<FileTreeNode>("/api/files/tree?path=."));
      setError(undefined);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }, []);

  const selectFile = useCallback(async (path: string) => {
    try {
      setSelected(await apiGet<FileContent>(`/api/files/content?path=${encodeURIComponent(path)}`));
      setError(undefined);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }, []);

  useEffect(() => {
    void refreshTree();
  }, [refreshTree]);

  return { tree, selected, error, refreshTree, selectFile };
}
```

- [x] **Step 3: Add hook tests with mocked fetch**

Create `webui/src/hooks/useFiles.test.tsx`:

```tsx
import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useFiles } from "./useFiles";

afterEach(() => vi.restoreAllMocks());

describe("useFiles", () => {
  it("loads the workspace tree", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      name: ".",
      path: ".",
      type: "directory",
      children: [{ name: "README.md", path: "README.md", type: "file" }]
    }), { status: 200 })));

    const { result } = renderHook(() => useFiles());

    await waitFor(() => expect(result.current.tree?.children?.[0]?.path).toBe("README.md"));
  });
});
```

Create `webui/src/hooks/useSessions.test.tsx`:

```tsx
import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useSessions } from "./useSessions";

afterEach(() => vi.restoreAllMocks());

describe("useSessions", () => {
  it("loads session summaries and active session", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const path = String(input);
      if (path === "/api/sessions") {
        return new Response(JSON.stringify([{ key: "default", createdAt: "", updatedAt: "", messageCount: 1, preview: "hello" }]), { status: 200 });
      }
      return new Response(JSON.stringify({ key: "default", messages: [], createdAt: "", updatedAt: "", metadata: {} }), { status: 200 });
    }));

    const { result } = renderHook(() => useSessions("default"));

    await waitFor(() => expect(result.current.sessions[0]?.key).toBe("default"));
    await waitFor(() => expect(result.current.activeSession?.key).toBe("default"));
  });
});
```

- [x] **Step 4: Verify hooks**

Run:

```bash
npm --prefix webui run test -- src/hooks
```

Expected: hook tests pass.

Result on 2026-06-21: covered by the full frontend test run, which passed.

- [x] **Step 5: Commit**

```bash
git add webui/src/hooks
git commit -m "feat(webui): load sessions and workspace files"
```

Result on 2026-06-21: included in final frontend implementation commit.

## Task 6: Implement Chat Thread, Execution Chain, Approval Card, And Composer

**Files:**
- Create: `webui/src/components/ChatThread.tsx`
- Create: `webui/src/components/ExecutionChain.tsx`
- Create: `webui/src/components/ApprovalCard.tsx`
- Create: `webui/src/components/Composer.tsx`
- Create: `webui/src/hooks/useAgentSocket.ts`
- Test: `webui/src/components/ExecutionChain.test.tsx`
- Test: `webui/src/components/ApprovalCard.test.tsx`
- Test: `webui/src/components/Composer.test.tsx`
- Test: `webui/src/components/ChatThread.test.tsx`

- [x] **Step 1: Define runtime UI state**

Create `webui/src/hooks/useAgentSocket.ts`:

```ts
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { createAgentSocket, type AgentSocket, type ServerMessage } from "../api/ws";

export interface ExecutionStep {
  id: string;
  kind: "thinking" | "tool";
  title: string;
  status: "pending" | "ok" | "error" | "approval" | "done";
  detail?: string;
}

export interface ApprovalRequest {
  id: string;
  command: string;
  resolved?: "approved" | "denied" | "expired";
}

export function useAgentSocket(sessionKey: string) {
  const socketRef = useRef<AgentSocket | undefined>();
  const [assistantDraft, setAssistantDraft] = useState("");
  const [steps, setSteps] = useState<ExecutionStep[]>([]);
  const [approval, setApproval] = useState<ApprovalRequest | undefined>();
  const [active, setActive] = useState(false);
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    const socket = createAgentSocket(sessionKey, {
      onMessage(message) {
        handleMessage(message);
      },
      onClose() {
        setActive(false);
      }
    });
    socketRef.current = socket;
    return () => socket.close();
  }, [sessionKey]);

  const handleMessage = useCallback((message: ServerMessage) => {
    if (message.type === "token") {
      setAssistantDraft((current) => current + message.text);
    } else if (message.type === "tool_call") {
      setSteps((current) => [...current, { id: message.id, kind: "tool", title: message.name, status: "pending", detail: JSON.stringify(message.arguments, null, 2) }]);
    } else if (message.type === "tool_result") {
      setSteps((current) => current.map((step) => step.id === message.id ? { ...step, status: message.status, detail: message.content } : step));
    } else if (message.type === "approve_request") {
      setApproval({ id: message.id, command: message.command });
      setSteps((current) => [...current, { id: message.id, kind: "tool", title: `exec ${message.command}`, status: "approval" }]);
    } else if (message.type === "done") {
      setActive(false);
    } else if (message.type === "error") {
      setActive(false);
      setError(message.error);
    } else if (message.type === "turn_rejected") {
      setError(message.reason);
    }
  }, []);

  const send = useCallback((text: string) => {
    setAssistantDraft("");
    setSteps([{ id: `thinking-${Date.now()}`, kind: "thinking", title: "Prepare response", status: "done" }]);
    setApproval(undefined);
    setError(undefined);
    setActive(true);
    socketRef.current?.send({ type: "user_message", text });
  }, []);

  const abort = useCallback(() => {
    socketRef.current?.send({ type: "abort" });
    setActive(false);
  }, []);

  const resolveApproval = useCallback((approved: boolean) => {
    if (!approval) {
      return;
    }
    socketRef.current?.send({ type: "approve_command", id: approval.id, approved });
    setApproval({ ...approval, resolved: approved ? "approved" : "denied" });
  }, [approval]);

  return useMemo(() => ({ assistantDraft, steps, approval, active, error, send, abort, resolveApproval }), [assistantDraft, steps, approval, active, error, send, abort, resolveApproval]);
}
```

- [x] **Step 2: Implement ExecutionChain**

Create `webui/src/components/ExecutionChain.tsx`:

```tsx
import type { ExecutionStep } from "../hooks/useAgentSocket";

interface ExecutionChainProps {
  steps: ExecutionStep[];
}

export default function ExecutionChain({ steps }: ExecutionChainProps): JSX.Element | null {
  if (steps.length === 0) {
    return null;
  }

  return (
    <details className="mb-5 rounded-ui bg-[#f8faf8] shadow-[inset_0_0_0_1px_#e1e5e2]" open>
      <summary className="flex min-h-[42px] cursor-pointer list-none items-center gap-2 px-3 text-sm text-muted">
        <span className="font-mono text-[11px] font-bold text-accent">&gt;</span>
        <span className="font-bold text-text">Execution chain</span>
        <span className="ml-auto font-mono text-[11px] text-[#9aa2aa]">{steps.length} steps</span>
      </summary>
      <div className="px-3 pb-2">
        {steps.map((step) => (
          <details key={step.id} className="border-t border-line">
            <summary className="flex min-h-[38px] cursor-pointer list-none items-center gap-2">
              <span className="font-mono text-[11px] font-bold text-accent">&gt;</span>
              <span className={`whitespace-nowrap font-mono text-[11px] ${step.kind === "tool" ? "text-green" : "text-accent"}`}>[{step.kind}]</span>
              <span className="truncate text-[13px] text-text">{step.title}</span>
              <span className="ml-auto whitespace-nowrap font-mono text-[10px] text-muted">{step.status}</span>
            </summary>
            {step.detail ? <pre className="mb-3 ml-7 whitespace-pre-wrap rounded-[7px] bg-[#111418] p-2.5 font-mono text-[11px] leading-relaxed text-[#dde7f3]">{step.detail}</pre> : null}
          </details>
        ))}
      </div>
    </details>
  );
}
```

- [x] **Step 3: Implement ApprovalCard**

Create `webui/src/components/ApprovalCard.tsx`:

```tsx
import type { ApprovalRequest } from "../hooks/useAgentSocket";

interface ApprovalCardProps {
  approval?: ApprovalRequest;
  onResolve(approved: boolean): void;
}

export default function ApprovalCard({ approval, onResolve }: ApprovalCardProps): JSX.Element | null {
  if (!approval) {
    return null;
  }

  return (
    <section className="mb-5 max-w-[520px] rounded-ui bg-approval-soft p-3.5">
      <strong className="mb-1 block text-sm text-ink">Approve command?</strong>
      <p className="mb-2.5 text-xs leading-relaxed text-muted">The agent wants to run this command in the current workspace.</p>
      <code className="block break-words rounded-[7px] bg-white/70 px-2.5 py-2 font-mono text-xs text-ink">{approval.command}</code>
      {approval.resolved ? (
        <div className="mt-2.5 font-mono text-xs text-muted">{approval.resolved}</div>
      ) : (
        <div className="mt-2.5 flex gap-2">
          <button className="h-8 rounded-[7px] bg-ink px-3 text-[13px] font-bold text-white" onClick={() => onResolve(true)}>Approve</button>
          <button className="h-8 rounded-[7px] border border-red/20 bg-white/60 px-3 text-[13px] font-bold text-red" onClick={() => onResolve(false)}>Deny</button>
        </div>
      )}
    </section>
  );
}
```

- [x] **Step 4: Implement Composer**

Create `webui/src/components/Composer.tsx`:

```tsx
import { Send } from "lucide-react";
import { useState } from "react";

interface ComposerProps {
  disabled: boolean;
  onSend(text: string): void;
}

export default function Composer({ disabled, onSend }: ComposerProps): JSX.Element {
  const [text, setText] = useState("");

  function submit(): void {
    const trimmed = text.trim();
    if (!trimmed || disabled) {
      return;
    }
    onSend(trimmed);
    setText("");
  }

  return (
    <footer className="border-t border-line py-3.5">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2.5 rounded-[10px] bg-white p-2.5 shadow-[inset_0_0_0_1px_#d4dad6]">
        <textarea
          className="min-h-14 resize-none border-0 bg-transparent text-sm leading-relaxed text-text outline-none placeholder:text-[#9aa2aa]"
          placeholder="Ask mini-agent to inspect files, edit code, run tools, or continue this task..."
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              submit();
            }
          }}
        />
        <button className="grid h-[38px] w-[38px] place-items-center rounded-ui bg-ink text-white disabled:opacity-40" disabled={disabled || !text.trim()} onClick={submit} aria-label="Send">
          <Send size={16} />
        </button>
      </div>
      <div className="mt-2 flex justify-between font-mono text-[11px] text-[#9aa2aa]">
        <span>Enter to send</span>
        <span>Shift+Enter newline</span>
      </div>
    </footer>
  );
}
```

- [x] **Step 5: Implement ChatThread**

Create `webui/src/components/ChatThread.tsx`:

```tsx
import type { MessageRecord } from "../api/types";
import type { ApprovalRequest, ExecutionStep } from "../hooks/useAgentSocket";
import ApprovalCard from "./ApprovalCard";
import Composer from "./Composer";
import ExecutionChain from "./ExecutionChain";

interface ChatThreadProps {
  sessionKey: string;
  messages: MessageRecord[];
  assistantDraft: string;
  steps: ExecutionStep[];
  approval?: ApprovalRequest;
  active: boolean;
  error?: string;
  onSend(text: string): void;
  onApprove(approved: boolean): void;
}

export default function ChatThread(props: ChatThreadProps): JSX.Element {
  return (
    <div className="mx-auto grid min-h-[746px] w-full max-w-[700px] grid-rows-[48px_minmax(0,1fr)_auto]">
      <div className="flex items-center justify-between border-b border-line">
        <strong className="text-sm text-ink">{props.sessionKey}</strong>
        <span className="font-mono text-[11px] text-muted">deepseek-chat</span>
      </div>
      <div className="overflow-hidden py-7">
        {props.messages.map((message, index) => (
          <article key={`${message.timestamp}-${index}`} className={`mb-5 ${message.role === "user" ? "ml-auto max-w-[620px]" : ""}`}>
            <div className="mb-1.5 font-mono text-[11px] uppercase text-[#9aa2aa]">{message.role === "user" ? "You" : "mini-agent"}</div>
            <div className={`rounded-ui p-4 text-sm leading-relaxed ${message.role === "user" ? "bg-accent-soft" : "bg-white shadow-[inset_0_0_0_1px_#e1e5e2]"}`}>{String(message.content ?? "")}</div>
          </article>
        ))}
        {props.assistantDraft ? (
          <article className="mb-5">
            <div className="mb-1.5 font-mono text-[11px] uppercase text-[#9aa2aa]">mini-agent</div>
            <div className="rounded-ui bg-white p-4 text-sm leading-relaxed shadow-[inset_0_0_0_1px_#e1e5e2]">{props.assistantDraft}</div>
          </article>
        ) : null}
        <ExecutionChain steps={props.steps} />
        <ApprovalCard approval={props.approval} onResolve={props.onApprove} />
        {props.error ? <div className="rounded-ui bg-red/10 p-3 text-sm text-red">{props.error}</div> : null}
      </div>
      <Composer disabled={props.active} onSend={props.onSend} />
    </div>
  );
}
```

- [x] **Step 6: Add component tests**

Create `webui/src/components/ExecutionChain.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import ExecutionChain from "./ExecutionChain";

describe("ExecutionChain", () => {
  it("renders thinking and tool steps", () => {
    render(<ExecutionChain steps={[
      { id: "1", kind: "thinking", title: "Plan", status: "done" },
      { id: "2", kind: "tool", title: "read_file README.md", status: "ok", detail: "content" }
    ]} />);

    expect(screen.getByText("Execution chain")).toBeInTheDocument();
    expect(screen.getByText("[thinking]")).toBeInTheDocument();
    expect(screen.getByText("[tool]")).toBeInTheDocument();
  });
});
```

Create `webui/src/components/ApprovalCard.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import ApprovalCard from "./ApprovalCard";

describe("ApprovalCard", () => {
  it("sends approval decisions", async () => {
    const onResolve = vi.fn();
    render(<ApprovalCard approval={{ id: "1", command: "npm test" }} onResolve={onResolve} />);

    await userEvent.click(screen.getByRole("button", { name: "Approve" }));

    expect(onResolve).toHaveBeenCalledWith(true);
  });
});
```

Create `webui/src/components/Composer.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import Composer from "./Composer";

describe("Composer", () => {
  it("sends text on Enter", async () => {
    const onSend = vi.fn();
    render(<Composer disabled={false} onSend={onSend} />);

    await userEvent.type(screen.getByPlaceholderText(/Ask mini-agent/), "hello{enter}");

    expect(onSend).toHaveBeenCalledWith("hello");
  });
});
```

- [x] **Step 7: Verify chat components**

Run:

```bash
npm --prefix webui run test -- src/components
npm --prefix webui run build
```

Expected: component tests and build pass.

Result on 2026-06-21: covered by the full frontend test and build runs, which
passed. Spec review required and received fixes for expired approvals on close,
active-turn abort control, and preserving composer draft after send.

- [x] **Step 8: Commit**

```bash
git add webui/src/components webui/src/hooks/useAgentSocket.ts
git commit -m "feat(webui): render chat execution flow"
```

Result on 2026-06-21: included in final frontend implementation commit.

## Task 7: Wire Real App State

**Files:**
- Modify: `webui/src/App.tsx`
- Modify: `webui/src/components/FilesSidebar.tsx`
- Test: `webui/src/App.test.tsx`

- [x] **Step 1: Replace demo data with hooks**

Modify `webui/src/App.tsx`:

```tsx
import { useState } from "react";

import AppShell from "./components/AppShell";
import ChatThread from "./components/ChatThread";
import FilesSidebar from "./components/FilesSidebar";
import SessionSidebar from "./components/SessionSidebar";
import SettingsView from "./components/SettingsView";
import { useAgentSocket } from "./hooks/useAgentSocket";
import { useFiles } from "./hooks/useFiles";
import { useSessions } from "./hooks/useSessions";

export default function App(): JSX.Element {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const sessions = useSessions("default");
  const files = useFiles();
  const socket = useAgentSocket(sessions.activeKey);

  return (
    <AppShell
      sessionSidebar={
        <SessionSidebar
          sessions={sessions.sessions}
          activeKey={sessions.activeKey}
          onSelect={sessions.loadSession}
          onNew={() => void sessions.loadSession(`session-${Date.now()}`)}
          onOpenSettings={() => setSettingsOpen(true)}
        />
      }
      filesSidebar={
        <FilesSidebar
          tree={files.tree}
          selectedPath={files.selected?.path}
          selectedContent={files.selected?.content}
          error={files.error}
          onSelect={files.selectFile}
          onRefresh={files.refreshTree}
        />
      }
      onOpenSettings={() => setSettingsOpen(true)}
    >
      {settingsOpen ? (
        <SettingsView onClose={() => setSettingsOpen(false)} />
      ) : (
        <ChatThread
          sessionKey={sessions.activeKey}
          messages={sessions.activeSession?.messages ?? []}
          assistantDraft={socket.assistantDraft}
          steps={socket.steps}
          approval={socket.approval}
          active={socket.active}
          error={socket.error ?? sessions.error}
          onSend={socket.send}
          onApprove={socket.resolveApproval}
        />
      )}
    </AppShell>
  );
}
```

- [x] **Step 2: Extend FilesSidebar with preview**

Modify `webui/src/components/FilesSidebar.tsx` props and bottom content:

```tsx
interface FilesSidebarProps {
  tree?: FileTreeNode;
  selectedPath?: string;
  selectedContent?: string;
  error?: string;
  onSelect(path: string): void;
  onRefresh(): void;
}
```

Render after the tree:

```tsx
{error ? <div className="mx-2.5 mt-3 rounded-ui bg-red/10 p-2.5 text-xs text-red">{error}</div> : null}
{selectedPath ? (
  <div className="mx-2.5 mt-3 rounded-ui bg-white p-2.5 shadow-[inset_0_0_0_1px_#e1e5e2]">
    <strong className="mb-2 block truncate font-mono text-[11px] text-ink">{selectedPath}</strong>
    <pre className="max-h-64 overflow-hidden whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-muted">{selectedContent?.slice(0, 1200) ?? "Loading..."}</pre>
  </div>
) : null}
```

- [x] **Step 3: Add app smoke test**

Create `webui/src/App.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import App from "./App";

class FakeWebSocket {
  addEventListener = vi.fn();
  send = vi.fn();
  close = vi.fn();
}

describe("App", () => {
  it("renders the main workspace regions", async () => {
    vi.stubGlobal("WebSocket", FakeWebSocket);
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const path = String(input);
      if (path === "/api/sessions") {
        return new Response(JSON.stringify([]), { status: 200 });
      }
      if (path.startsWith("/api/sessions/")) {
        return new Response(JSON.stringify({ key: "default", messages: [], createdAt: "", updatedAt: "", metadata: {} }), { status: 200 });
      }
      if (path.startsWith("/api/files/tree")) {
        return new Response(JSON.stringify({ name: ".", path: ".", type: "directory", children: [] }), { status: 200 });
      }
      return new Response(JSON.stringify({}), { status: 200 });
    }));

    render(<App />);

    expect(screen.getByText("mini-agent")).toBeInTheDocument();
    expect(await screen.findByText("Sessions")).toBeInTheDocument();
    expect(screen.getByText("Files")).toBeInTheDocument();
  });
});
```

- [x] **Step 4: Verify integrated app**

Run:

```bash
npm --prefix webui run test -- src/App.test.tsx
npm --prefix webui run build
```

Expected: integrated test and build pass.

Result on 2026-06-21: covered by the full frontend test and build runs, which
passed. Spec review passed.

- [x] **Step 5: Commit**

```bash
git add webui/src/App.tsx webui/src/App.test.tsx webui/src/components/FilesSidebar.tsx
git commit -m "feat(webui): wire frontend state"
```

Result on 2026-06-21: included in final frontend implementation commit.

## Task 8: Implement Settings View

**Files:**
- Create: `webui/src/components/SettingsView.tsx`
- Create: `webui/src/hooks/useConfig.ts`
- Test: `webui/src/components/SettingsView.test.tsx`

- [x] **Step 1: Add config hook**

Create `webui/src/hooks/useConfig.ts`:

```ts
import { useCallback, useEffect, useState } from "react";

import { apiGet, apiPut } from "../api/http";
import type { Config, ToolDefinition } from "../api/types";

export function useConfig() {
  const [config, setConfig] = useState<Config | undefined>();
  const [tools, setTools] = useState<ToolDefinition[]>([]);
  const [error, setError] = useState<string | undefined>();

  const refresh = useCallback(async () => {
    try {
      const [nextConfig, nextTools] = await Promise.all([
        apiGet<Config>("/api/config"),
        apiGet<ToolDefinition[]>("/api/tools")
      ]);
      setConfig(nextConfig);
      setTools(nextTools);
      setError(undefined);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }, []);

  const save = useCallback(async (patch: Partial<Config>) => {
    try {
      setConfig(await apiPut<Config>("/api/config", patch));
      setError(undefined);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { config, tools, error, refresh, save };
}
```

- [x] **Step 2: Add settings component**

Create `webui/src/components/SettingsView.tsx`:

```tsx
import { X } from "lucide-react";

import { useConfig } from "../hooks/useConfig";

interface SettingsViewProps {
  onClose(): void;
}

export default function SettingsView({ onClose }: SettingsViewProps): JSX.Element {
  const { config, tools, error } = useConfig();

  return (
    <div className="mx-auto min-h-[746px] w-full max-w-[700px] py-6">
      <div className="mb-5 flex items-center justify-between border-b border-line pb-3">
        <div>
          <h1 className="m-0 text-lg font-bold text-ink">Settings</h1>
          <p className="mt-1 text-sm text-muted">Provider, agent limits, tools, search, and exec configuration.</p>
        </div>
        <button className="grid h-8 w-8 place-items-center rounded-ui border border-line bg-white" onClick={onClose} aria-label="Close settings">
          <X size={15} />
        </button>
      </div>
      {error ? <div className="mb-4 rounded-ui bg-red/10 p-3 text-sm text-red">{error}</div> : null}
      <section className="mb-4 rounded-ui bg-white p-4 shadow-[inset_0_0_0_1px_#e1e5e2]">
        <h2 className="mb-3 text-sm font-bold text-ink">Provider</h2>
        <dl className="grid grid-cols-[140px_minmax(0,1fr)] gap-2 text-sm">
          <dt className="text-muted">Name</dt><dd>{config?.provider.name ?? "-"}</dd>
          <dt className="text-muted">Base URL</dt><dd className="truncate font-mono text-xs">{config?.provider.baseUrl ?? "-"}</dd>
          <dt className="text-muted">Model</dt><dd>{config?.provider.model ?? "-"}</dd>
          <dt className="text-muted">API key</dt><dd className="font-mono text-xs">{config?.provider.apiKey ?? "(env/local)"}</dd>
        </dl>
      </section>
      <section className="rounded-ui bg-white p-4 shadow-[inset_0_0_0_1px_#e1e5e2]">
        <h2 className="mb-3 text-sm font-bold text-ink">Tools</h2>
        <div className="grid gap-2">
          {tools.map((tool) => <div key={tool.function.name} className="font-mono text-xs text-muted">{tool.function.name}</div>)}
        </div>
      </section>
    </div>
  );
}
```

- [x] **Step 3: Add settings test**

Create `webui/src/components/SettingsView.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import SettingsView from "./SettingsView";

describe("SettingsView", () => {
  it("loads redacted provider config", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const path = String(input);
      if (path === "/api/config") {
        return new Response(JSON.stringify({
          workspace: ".",
          provider: { name: "deepseek", apiKey: "***", model: "deepseek-chat" },
          agent: { maxIterations: 10, maxToolResultChars: 12000 },
          sessions: { dir: ".mini-agent/workspace/sessions", defaultKey: "default", maxHistoryMessages: 100, maxHistoryChars: 200000 }
        }), { status: 200 });
      }
      return new Response(JSON.stringify([]), { status: 200 });
    }));

    render(<SettingsView onClose={vi.fn()} />);

    expect(await screen.findByText("deepseek")).toBeInTheDocument();
    expect(await screen.findByText("***")).toBeInTheDocument();
  });
});
```

- [x] **Step 4: Verify settings**

Run:

```bash
npm --prefix webui run test -- src/components/SettingsView.test.tsx
npm --prefix webui run build
```

Expected: settings test and build pass.

Result on 2026-06-21: after `npm --prefix webui install`, full frontend tests
and build passed:

```bash
npm --prefix webui run test
npm --prefix webui run build
```

- [x] **Step 5: Commit**

```bash
git add webui/src/components/SettingsView.tsx webui/src/hooks/useConfig.ts webui/src/components/SettingsView.test.tsx
git commit -m "feat(webui): add settings view"
```

Result on 2026-06-21: commit handled in the final frontend implementation
commit after full verification.

## Task 9: Polish, Manual Verification, And Docs

**Files:**
- Modify: `README.md`
- Modify: `docs/ROADMAP.md`
- Modify: `docs/specs/2026-06-20-webui-frontend-design.md` if implementation decisions changed

- [x] **Step 1: Add README frontend commands**

Add under Web UI Backend or Scripts:

```md
Frontend development:

```bash
npm --prefix webui install
npm run web:dev
```

Production frontend build:

```bash
npm run web:build
npm run build
node dist/server.js --workspace . --host 127.0.0.1 --port 3210
```

The server serves `dist/webui` when present.
```

- [x] **Step 2: Update roadmap frontend checklist**

In `docs/ROADMAP.md`, mark completed items after implementation lands:

```md
- [x] React + TypeScript + shadcn/ui + Tailwind
- [x] Chat interface with streaming text and tool call cards
- [x] Session sidebar (list, search, switch, delete)
- [x] Workspace file browser with syntax highlighting (Monaco Editor)
- [x] Config panel (provider, agent params)
```

Only check items that are truly implemented. If Monaco or delete is deferred, leave
that item unchecked and add a short note.

- [x] **Step 3: Run full frontend verification**

Run:

```bash
npm --prefix webui run test
npm --prefix webui run build
```

Expected: tests pass; `dist/webui` exists.

Result on 2026-06-21: frontend tests passed 11 files / 31 tests, and Vite
production build emitted `dist/webui`.

- [x] **Step 4: Run root verification**

Run:

```bash
npm test
npm run typecheck
npm run build
```

Expected: root tests, typecheck, and build pass.

Result on 2026-06-21: root tests passed 21 files / 100 tests; typecheck and
build exited 0.

- [x] **Step 5: Manual server verification**

Run:

```bash
node dist/server.js --workspace . --host 127.0.0.1 --port 3210
```

Open:

```text
http://127.0.0.1:3210
```

Verify:

- sessions list loads
- default session history loads
- right files sidebar loads tree and file preview
- settings opens from sidebar
- sending a message creates a WebSocket turn
- token events stream into the assistant message
- tool events appear under `Execution chain`
- exec approval appears inline when backend sends `approve_request`

Result on 2026-06-21: started `node dist/server.js --workspace . --host
127.0.0.1 --port 3210`, verified `/` returns the built React HTML, verified
`/api/sessions` returns session JSON, and verified `/api/files/tree?path=.`
returns a workspace file tree. Live model turn and exec approval were not run
because they require an interactive provider-backed session.

- [ ] **Step 6: Commit**

```bash
git add README.md docs/ROADMAP.md docs/specs/2026-06-20-webui-frontend-design.md webui package.json
git commit -m "docs(webui): document frontend workflow"
```

## Self-Review Checklist

- [ ] The plan implements the approved layout: left sessions, centered chat, right files sidebar.
- [ ] Settings remains a secondary screen.
- [ ] Execution chain parent and child steps are collapsible.
- [ ] `[thinking]` and `[tool]` labels are represented in the component model.
- [ ] Exec approval is inline in the chat flow.
- [ ] No persistent run-state sidebar is introduced.
- [ ] Backend boundaries are preserved; frontend consumes REST/WS only.
- [ ] Root verification commands remain `npm test`, `npm run typecheck`, `npm run build`.
