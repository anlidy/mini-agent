import { fireEvent, render, screen } from "@testing-library/react";
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

  it("still renders children when collapsed (sidebar handles its own collapsed view)", () => {
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

    // Children are always rendered — the panel just narrows to 48px
    expect(screen.getByText("Panel content")).toBeInTheDocument();
  });

  it("renders at 48px width when collapsed", () => {
    const { container } = render(
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

    const panel = container.firstElementChild as HTMLElement;
    expect(panel.style.width).toBe("48px");
  });

  it("hides drag handle when collapsed", () => {
    const { container } = render(
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

    expect(container.querySelector(".cursor-col-resize")).toBeNull();
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
