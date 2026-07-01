import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { createMemoryRouter, RouterProvider } from "react-router-dom";

import SessionSidebar from "@/components/SessionSidebar";
import type { SessionSummary } from "@/api/types";

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

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe("SessionSidebar", () => {
  it("renders session list", () => {
    const sessions = [sessionSummary("default"), sessionSummary("other")];
    renderWithRouter(
      <SessionSidebar
        sessions={sessions}
        activeKey="default"
        onSelect={vi.fn()}
        onNew={vi.fn()}
        onToggleCollapse={vi.fn()}
      />
    );

    expect(screen.getByText("default")).toBeInTheDocument();
    expect(screen.getByText("other")).toBeInTheDocument();
  });

  it("highlights active session", () => {
    const sessions = [sessionSummary("default"), sessionSummary("other")];
    renderWithRouter(
      <SessionSidebar
        sessions={sessions}
        activeKey="other"
        onSelect={vi.fn()}
        onNew={vi.fn()}
        onToggleCollapse={vi.fn()}
      />
    );

    const activeBtn = screen.getByRole("button", { name: /other/ });
    expect(activeBtn).toHaveAttribute("aria-current", "page");
  });

  it("calls onSelect when session is clicked", async () => {
    const sessions = [sessionSummary("default"), sessionSummary("other")];
    const onSelect = vi.fn();
    renderWithRouter(
      <SessionSidebar
        sessions={sessions}
        activeKey="default"
        onSelect={onSelect}
        onNew={vi.fn()}
        onToggleCollapse={vi.fn()}
      />
    );

    await userEvent.click(screen.getByRole("button", { name: /other/ }));
    expect(onSelect).toHaveBeenCalledWith("other");
  });

  it("filters sessions by search query", async () => {
    const sessions = [
      sessionSummary("default", "hello world"),
      sessionSummary("other", "goodbye moon")
    ];
    renderWithRouter(
      <SessionSidebar
        sessions={sessions}
        activeKey="default"
        onSelect={vi.fn()}
        onNew={vi.fn()}
        onToggleCollapse={vi.fn()}
      />
    );

    const searchInput = screen.getByPlaceholderText("Search sessions...");
    await userEvent.type(searchInput, "goodbye");

    expect(screen.queryByText("default")).not.toBeInTheDocument();
    expect(screen.getByText("other")).toBeInTheDocument();
  });

  it("shows empty state when no sessions", () => {
    renderWithRouter(
      <SessionSidebar
        sessions={[]}
        activeKey="default"
        onSelect={vi.fn()}
        onNew={vi.fn()}
        onToggleCollapse={vi.fn()}
      />
    );

    expect(screen.getByText("No sessions yet")).toBeInTheDocument();
  });

  it("shows 'no matching' when search has no results", async () => {
    const sessions = [sessionSummary("default")];
    renderWithRouter(
      <SessionSidebar
        sessions={sessions}
        activeKey="default"
        onSelect={vi.fn()}
        onNew={vi.fn()}
        onToggleCollapse={vi.fn()}
      />
    );

    await userEvent.type(screen.getByPlaceholderText("Search sessions..."), "xyz");
    expect(screen.getByText("No matching sessions")).toBeInTheDocument();
  });

  it("navigates to settings on gear icon click", async () => {
    const sessions = [sessionSummary("default")];
    renderWithRouter(
      <SessionSidebar
        sessions={sessions}
        activeKey="default"
        onSelect={vi.fn()}
        onNew={vi.fn()}
        onToggleCollapse={vi.fn()}
      />
    );

    await userEvent.click(screen.getByRole("button", { name: "Settings" }));
    expect(screen.getByText("Settings Page")).toBeInTheDocument();
  });
});
