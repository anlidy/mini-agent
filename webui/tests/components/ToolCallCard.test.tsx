import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import ToolCallCard, { type ToolStep } from "@/components/ToolCallCard";

function step(overrides: Partial<ToolStep> = {}): ToolStep {
  return {
    id: "t1",
    kind: "tool",
    title: "read_file",
    status: "pending",
    ...overrides
  };
}

describe("ToolCallCard", () => {
  it("renders tool title", () => {
    render(<ToolCallCard step={step()} isLast={true} />);
    expect(screen.getByText("[read_file]")).toBeInTheDocument();
  });

  it("shows pending pulse indicator", () => {
    render(<ToolCallCard step={step({ status: "pending" })} isLast={true} />);
    // The animate-pulse dot
    expect(document.querySelector(".animate-pulse")).toBeTruthy();
  });

  it("shows error styling for error status", () => {
    render(<ToolCallCard step={step({ status: "error", detail: "failed" })} isLast={true} />);
    const btn = screen.getByRole("button");
    expect(btn.className).toContain("text-red");
  });

  it("expands to show detail on click", async () => {
    render(
      <ToolCallCard
        step={step({ status: "ok", detail: "file content here" })}
        isLast={true}
      />
    );

    await userEvent.click(screen.getByRole("button"));

    expect(screen.getByText("file content here")).toBeInTheDocument();
  });

  it("parses JSON detail into args section", async () => {
    render(
      <ToolCallCard
        step={step({
          status: "ok",
          detail: JSON.stringify({ path: "/tmp/test", encoding: "utf-8" })
        })}
        isLast={true}
      />
    );

    await userEvent.click(screen.getByRole("button"));

    expect(screen.getByText("args")).toBeInTheDocument();
  });

  it("renders nested indent with vertical line", () => {
    const { container } = render(
      <ToolCallCard step={step()} isLast={false} nested={true} />
    );

    // The vertical connector line
    expect(container.querySelector(".bg-connector")).toBeTruthy();
  });
});
