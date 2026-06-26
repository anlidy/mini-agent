import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import ExecutionChain from "./ExecutionChain";

describe("ExecutionChain", () => {
  it("renders collapsible thinking and tool steps with real detail", () => {
    render(
      <ExecutionChain
        steps={[
          { id: "1", kind: "thinking", title: "Plan response", status: "done", detail: "Need inspect files." },
          {
            id: "2",
            kind: "tool",
            title: "read_file README.md",
            status: "ok",
            detail: "file contents"
          }
        ]}
      />
    );

    expect(screen.getByText("Execution chain")).toBeInTheDocument();
    expect(screen.getByText("2 steps")).toBeInTheDocument();
    expect(screen.getByText("[thinking]")).toBeInTheDocument();
    expect(screen.getByText("Plan response")).toBeInTheDocument();
    expect(screen.getByText("Need inspect files.")).toBeInTheDocument();
    expect(screen.getByText("[tool]")).toBeInTheDocument();
    expect(screen.getByText("read_file README.md")).toBeInTheDocument();
    expect(screen.getByText("file contents")).toBeInTheDocument();
  });

  it("does not render when there are no steps", () => {
    const { container } = render(<ExecutionChain steps={[]} />);

    expect(container).toBeEmptyDOMElement();
  });

  it("does not render placeholder thinking without real detail", () => {
    const { container } = render(
      <ExecutionChain steps={[{ id: "1", kind: "thinking", title: "Prepare response", status: "done" }]} />
    );

    expect(container).toBeEmptyDOMElement();
  });
});
