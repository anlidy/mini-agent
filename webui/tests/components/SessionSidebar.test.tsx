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

function sessionSummary(key: string, preview = `${key} preview`): SessionSummary {
  return { key, createdAt: "", updatedAt: "", messageCount: 1, preview };
}

const defaultProps = {
  onDelete: vi.fn().mockResolvedValue(undefined),
  onRename: vi.fn(),
  getDisplayName: (key: string) => key,
  projects: [] as Project[],
  projectMap: new Map<string, string[]>(),
  orphans: [] as string[],
  onCreateProject: vi.fn(),
  onDeleteProject: vi.fn(),
  onAddToProject: vi.fn(),
  onRemoveFromProject: vi.fn(),
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

    expect(screen.getByText("default")).toBeInTheDocument();
    expect(screen.getByText("other")).toBeInTheDocument();
  });

  it("highlights active session", () => {
    const sessions = [sessionSummary("default"), sessionSummary("other")];
    renderWithRouter(
      <SessionSidebar
        {...defaultProps}
        sessions={sessions}
        activeKey="other"
        onSelect={vi.fn()}
        onNew={vi.fn()}
        onToggleCollapse={vi.fn()}
        orphans={["default", "other"]}
      />
    );

    const activeBtn = screen.getAllByRole("button", { name: /other/ })[0];
    expect(activeBtn).toHaveAttribute("aria-current", "page");
  });

  it("calls onSelect when session is clicked", async () => {
    const sessions = [sessionSummary("default"), sessionSummary("other")];
    const onSelect = vi.fn();
    renderWithRouter(
      <SessionSidebar
        {...defaultProps}
        sessions={sessions}
        activeKey="default"
        onSelect={onSelect}
        onNew={vi.fn()}
        onToggleCollapse={vi.fn()}
        orphans={["default", "other"]}
      />
    );

    const sessionBtns = screen.getAllByRole("button", { name: /other/ });
    const selectBtn = sessionBtns.find(
      (b) => b.getAttribute("aria-current") !== "page"
    )!;
    await userEvent.click(selectBtn);
    expect(onSelect).toHaveBeenCalledWith("other");
  });

  it("filters sessions by search query", async () => {
    const sessions = [
      sessionSummary("default", "hello world"),
      sessionSummary("other", "goodbye moon")
    ];
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

    await userEvent.click(screen.getByRole("button", { name: "Search sessions" }));
    const searchInput = screen.getByPlaceholderText("搜索对话...");
    await userEvent.type(searchInput, "goodbye");

    expect(screen.queryByText("default")).not.toBeInTheDocument();
    expect(screen.getByText("other")).toBeInTheDocument();
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
      createdAt: new Date().toISOString(),
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
    expect(screen.getByText("session-a")).toBeInTheDocument();
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
});
