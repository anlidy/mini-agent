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
