import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import AppShell from "@/components/AppShell";

const defaultProps = {
  leftCollapsed: false,
  rightCollapsed: false,
  leftWidth: 260,
  rightWidth: 300,
  onToggleLeft: vi.fn(),
  onToggleRight: vi.fn(),
  onLeftWidthChange: vi.fn(),
  onRightWidthChange: vi.fn()
};

describe("AppShell", () => {
  it("renders sessions, centered chat, and files regions", () => {
    render(
      <AppShell
        {...defaultProps}
        sessionSidebar={<div>Sessions region</div>}
        filesSidebar={<div>Files region</div>}
      >
        <div>Chat region</div>
      </AppShell>
    );

    expect(screen.getByText("Sessions region")).toBeInTheDocument();
    expect(screen.getByText("Chat region")).toBeInTheDocument();
    expect(screen.getByText("Files region")).toBeInTheDocument();
  });

  it("renders full viewport layout without a header", () => {
    const { container } = render(
      <AppShell
        {...defaultProps}
        sessionSidebar={<div>Sessions region</div>}
        filesSidebar={<div>Files region</div>}
      >
        <div>Chat region</div>
      </AppShell>
    );

    expect(container.firstElementChild).toHaveClass("h-screen", "w-screen");
    expect(screen.getByRole("main")).toHaveClass("overflow-hidden");
  });

  it("hides the right panel when filesSidebar is null", () => {
    render(
      <AppShell
        {...defaultProps}
        sessionSidebar={<div>Sessions region</div>}
        filesSidebar={null}
      >
        <div>Chat region</div>
      </AppShell>
    );

    expect(screen.getByText("Sessions region")).toBeInTheDocument();
    expect(screen.getByText("Chat region")).toBeInTheDocument();
    expect(screen.queryByText("Files region")).not.toBeInTheDocument();
  });
});
