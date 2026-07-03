import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { createMemoryRouter, RouterProvider } from "react-router-dom";

import SessionSidebar from "@/components/SessionSidebar";
import type { SessionSummary } from "@/api/types";
import type { Project } from "@/hooks/useProjects";

/* ------------------------------------------------------------------ */
/*  Wrapper with router context                                       */
/* ------------------------------------------------------------------ */

function renderWithRouter(ui: React.ReactElement) {
  const router = createMemoryRouter(
    [
      {
        path: "/",
        element: ui
      },
      {
        path: "/settings",
        element: <div>Settings Page</div>
      }
    ],
    { initialEntries: ["/"] }
  );
  return render(<RouterProvider router={router} />);
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function sessionSummary(key: string): SessionSummary {
  return { key, createdAt: "", updatedAt: "", messageCount: 1, title: "" };
}

const defaultProps = {
  onDelete: vi.fn().mockResolvedValue(undefined),
  onRename: vi.fn(),
  getDisplayName: (key: string) => key,
  projects: [] as Project[],
  projectMap: new Map<string, string[]>(),
  orphans: [] as string[],
  onNewInProject: vi.fn(),
};

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe("SessionSidebar", () => {
  it("renders session list in conversations section", () => {
    const sessions = [sessionSummary("default"), sessionSummary("other")];
    renderWithRouter(
      <SessionSidebar
        {...defaultProps}
        sessions={sessions}
        activeKey="default"
        onSelect={vi.fn()}
        onNew={vi.fn()}
        onToggleCollapse={vi.fn()}
        orphans={["default", "other"]}
      />
    );

    // Without custom display names, sessions show "新对话" as title
    expect(screen.getAllByText("新对话")).toHaveLength(2);
  });

  it("highlights active session", () => {
    const sessions = [sessionSummary("default"), sessionSummary("other")];
    const getDisplayName = (key: string) => key === "other" ? "Other Chat" : "Default Chat";

    renderWithRouter(
      <SessionSidebar
        {...defaultProps}
        sessions={sessions}
        activeKey="other"
        onSelect={vi.fn()}
        onNew={vi.fn()}
        onToggleCollapse={vi.fn()}
        orphans={["default", "other"]}
        getDisplayName={getDisplayName}
      />
    );

    const activeBtn = screen.getByRole("button", { name: "Other Chat" });
    expect(activeBtn).toHaveAttribute("aria-current", "page");
  });

  it("calls onSelect when session is clicked", async () => {
    const sessions = [sessionSummary("default"), sessionSummary("other")];
    const onSelect = vi.fn();
    const getDisplayName = (key: string) => key === "other" ? "Other Chat" : "Default Chat";

    renderWithRouter(
      <SessionSidebar
        {...defaultProps}
        sessions={sessions}
        activeKey="default"
        onSelect={onSelect}
        onNew={vi.fn()}
        onToggleCollapse={vi.fn()}
        orphans={["default", "other"]}
        getDisplayName={getDisplayName}
      />
    );

    const sessionBtn = screen.getByRole("button", { name: "Other Chat" });
    await userEvent.click(sessionBtn);
    expect(onSelect).toHaveBeenCalledWith("other");
  });

  it("filters sessions by search query", async () => {
    const sessions = [
      sessionSummary("default"),
      sessionSummary("other")
    ];
    const getDisplayName = (key: string) =>
      key === "default" ? "hello world" : key === "other" ? "goodbye moon" : key;

    renderWithRouter(
      <SessionSidebar
        {...defaultProps}
        sessions={sessions}
        activeKey="default"
        onSelect={vi.fn()}
        onNew={vi.fn()}
        onToggleCollapse={vi.fn()}
        orphans={["default", "other"]}
        getDisplayName={getDisplayName}
      />
    );

    await userEvent.click(screen.getByRole("button", { name: "Search sessions" }));
    const searchInput = screen.getByPlaceholderText("搜索对话...");
    await userEvent.type(searchInput, "goodbye");

    expect(screen.queryByText("hello world")).not.toBeInTheDocument();
    expect(screen.getByText("goodbye moon")).toBeInTheDocument();
  });

  it("shows empty state when no sessions", () => {
    renderWithRouter(
      <SessionSidebar
        {...defaultProps}
        sessions={[]}
        activeKey="default"
        onSelect={vi.fn()}
        onNew={vi.fn()}
        onToggleCollapse={vi.fn()}
        orphans={[]}
      />
    );

    expect(screen.getByText("暂无对话")).toBeInTheDocument();
  });

  it("shows 'no matching' when search has no results", async () => {
    const sessions = [sessionSummary("default")];
    renderWithRouter(
      <SessionSidebar
        {...defaultProps}
        sessions={sessions}
        activeKey="default"
        onSelect={vi.fn()}
        onNew={vi.fn()}
        onToggleCollapse={vi.fn()}
        orphans={["default"]}
      />
    );

    await userEvent.click(screen.getByRole("button", { name: "Search sessions" }));
    await userEvent.type(screen.getByPlaceholderText("搜索对话..."), "xyz");
    expect(screen.getByText("没有匹配的对话")).toBeInTheDocument();
  });

  it("navigates to settings on bottom settings row", async () => {
    const sessions = [sessionSummary("default")];
    renderWithRouter(
      <SessionSidebar
        {...defaultProps}
        sessions={sessions}
        activeKey="default"
        onSelect={vi.fn()}
        onNew={vi.fn()}
        onToggleCollapse={vi.fn()}
        orphans={["default"]}
      />
    );

    await userEvent.click(screen.getByText("设置"));
    expect(screen.getByText("Settings Page")).toBeInTheDocument();
  });

  it("renders projects section when projects exist", () => {
    const project: Project = {
      id: "proj-1",
      name: "My Project",
      sessionKeys: ["session-a"],
    };
    const projectMap = new Map<string, string[]>([["proj-1", ["session-a"]]]);
    const sessions = [sessionSummary("session-a")];

    renderWithRouter(
      <SessionSidebar
        {...defaultProps}
        sessions={sessions}
        activeKey="session-a"
        onSelect={vi.fn()}
        onNew={vi.fn()}
        onToggleCollapse={vi.fn()}
        projects={[project]}
        projectMap={projectMap}
        orphans={[]}
      />
    );

    expect(screen.getByText("项目")).toBeInTheDocument();
    expect(screen.getByText("My Project")).toBeInTheDocument();
    expect(screen.getByText("新对话")).toBeInTheDocument();
  });

  it("renders display name instead of session key", () => {
    const sessions = [sessionSummary("session-a")];
    const getDisplayName = (key: string) => key === "session-a" ? "Fancy Name" : key;

    renderWithRouter(
      <SessionSidebar
        {...defaultProps}
        sessions={sessions}
        activeKey="session-a"
        onSelect={vi.fn()}
        onNew={vi.fn()}
        onToggleCollapse={vi.fn()}
        orphans={["session-a"]}
        getDisplayName={getDisplayName}
      />
    );

    expect(screen.getByText("Fancy Name")).toBeInTheDocument();
  });

  it("renames a session from the session menu", async () => {
    const sessions = [sessionSummary("session-a")];
    const onRename = vi.fn();

    renderWithRouter(
      <SessionSidebar
        {...defaultProps}
        sessions={sessions}
        activeKey="session-a"
        onSelect={vi.fn()}
        onNew={vi.fn()}
        onToggleCollapse={vi.fn()}
        onRename={onRename}
        orphans={["session-a"]}
      />
    );

    await userEvent.click(screen.getByRole("button", { name: "Session menu" }));
    await userEvent.click(screen.getByRole("button", { name: "Rename" }));
    const input = await screen.findByRole("textbox");
    expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cancel" })).not.toBeInTheDocument();
    await userEvent.clear(input);
    await userEvent.type(input, "Renamed session");
    await userEvent.keyboard("{Enter}");

    expect(onRename).toHaveBeenCalledWith("session-a", "Renamed session");
  });

  it("cancels inline rename with escape", async () => {
    const sessions = [sessionSummary("session-a")];
    const onRename = vi.fn();

    renderWithRouter(
      <SessionSidebar
        {...defaultProps}
        sessions={sessions}
        activeKey="session-a"
        onSelect={vi.fn()}
        onNew={vi.fn()}
        onToggleCollapse={vi.fn()}
        onRename={onRename}
        orphans={["session-a"]}
      />
    );

    await userEvent.click(screen.getByRole("button", { name: "Session menu" }));
    await userEvent.click(screen.getByRole("button", { name: "Rename" }));
    const input = await screen.findByRole("textbox");
    await userEvent.clear(input);
    await userEvent.type(input, "Discarded name");
    await userEvent.keyboard("{Escape}");

    expect(onRename).not.toHaveBeenCalled();
    expect(screen.queryByDisplayValue("Discarded name")).not.toBeInTheDocument();
    expect(screen.getByText("新对话")).toBeInTheDocument();
  });

  it("deletes a session from the session menu", async () => {
    const sessions = [sessionSummary("session-a")];
    const onDelete = vi.fn().mockResolvedValue(undefined);

    renderWithRouter(
      <SessionSidebar
        {...defaultProps}
        sessions={sessions}
        activeKey="session-a"
        onSelect={vi.fn()}
        onNew={vi.fn()}
        onToggleCollapse={vi.fn()}
        onDelete={onDelete}
        orphans={["session-a"]}
      />
    );

    await userEvent.click(screen.getByRole("button", { name: "Session menu" }));
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));

    expect(onDelete).toHaveBeenCalledWith("session-a");
  });
});
