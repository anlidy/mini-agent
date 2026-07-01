import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import ResizablePanel from "@/components/ResizablePanel";

describe("ResizablePanel", () => {
  it("renders children when not collapsed", () => {
    render(
      <ResizablePanel
        collapsed={false}
        onToggle={vi.fn()}
        width={260}
        onWidthChange={vi.fn()}
        side="left"
      >
        <div>Panel content</div>
      </ResizablePanel>
    );

    expect(screen.getByText("Panel content")).toBeInTheDocument();
  });

  it("hides children and shows expand button when collapsed", () => {
    render(
      <ResizablePanel
        collapsed={true}
        onToggle={vi.fn()}
        width={260}
        onWidthChange={vi.fn()}
        side="left"
      >
        <div>Panel content</div>
      </ResizablePanel>
    );

    expect(screen.queryByText("Panel content")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Expand left panel" })).toBeInTheDocument();
  });

  it("calls onToggle when expand button is clicked", async () => {
    const onToggle = vi.fn();
    render(
      <ResizablePanel
        collapsed={true}
        onToggle={onToggle}
        width={260}
        onWidthChange={vi.fn()}
        side="left"
      >
        <div>content</div>
      </ResizablePanel>
    );

    await userEvent.click(screen.getByRole("button", { name: "Expand left panel" }));
    expect(onToggle).toHaveBeenCalledOnce();
  });

  it("shows right chevron for left panel, left chevron for right panel", () => {
    const { rerender } = render(
      <ResizablePanel
        collapsed={true}
        onToggle={vi.fn()}
        width={260}
        onWidthChange={vi.fn()}
        side="left"
      >
        <div>content</div>
      </ResizablePanel>
    );

    expect(screen.getByRole("button", { name: "Expand left panel" })).toBeInTheDocument();

    rerender(
      <ResizablePanel
        collapsed={true}
        onToggle={vi.fn()}
        width={260}
        onWidthChange={vi.fn()}
        side="right"
      >
        <div>content</div>
      </ResizablePanel>
    );

    expect(screen.getByRole("button", { name: "Expand right panel" })).toBeInTheDocument();
  });

  it("resizes on drag", () => {
    const onWidthChange = vi.fn();
    render(
      <ResizablePanel
        collapsed={false}
        onToggle={vi.fn()}
        width={260}
        onWidthChange={onWidthChange}
        side="left"
      >
        <div>content</div>
      </ResizablePanel>
    );

    const handle = document.querySelector(".cursor-col-resize")!;
    expect(handle).toBeTruthy();

    // Start drag
    fireEvent.mouseDown(handle, { clientX: 260 });
    // Move right by 40px
    fireEvent.mouseMove(document, { clientX: 300 });
    // Release
    fireEvent.mouseUp(document);

    expect(onWidthChange).toHaveBeenCalledWith(300);
  });

  it("respects min/max width bounds during resize", () => {
    const onWidthChange = vi.fn();
    render(
      <ResizablePanel
        collapsed={false}
        onToggle={vi.fn()}
        width={260}
        onWidthChange={onWidthChange}
        minWidth={180}
        maxWidth={480}
        side="left"
      >
        <div>content</div>
      </ResizablePanel>
    );

    const handle = document.querySelector(".cursor-col-resize")!;

    // Try to shrink below min
    fireEvent.mouseDown(handle, { clientX: 200 });
    fireEvent.mouseMove(document, { clientX: 10 }); // delta = -190 → 260 - 190 = 70 → clamped to 180
    fireEvent.mouseUp(document);
    expect(onWidthChange).toHaveBeenCalledWith(180);

    onWidthChange.mockClear();

    // Try to expand beyond max
    fireEvent.mouseDown(handle, { clientX: 260 });
    fireEvent.mouseMove(document, { clientX: 800 }); // delta = 540 → 260 + 540 = 800 → clamped to 480
    fireEvent.mouseUp(document);
    expect(onWidthChange).toHaveBeenCalledWith(480);
  });
});
