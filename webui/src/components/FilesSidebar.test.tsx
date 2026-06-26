import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { FileTreeNode } from "../api/types";
import FilesSidebar from "./FilesSidebar";

const tree: FileTreeNode = {
  name: ".",
  path: ".",
  type: "directory",
  children: [
    {
      name: "src",
      path: "src",
      type: "directory",
      children: [
        {
          name: "index.ts",
          path: "src/index.ts",
          type: "file"
        }
      ]
    },
    {
      name: "README.md",
      path: "README.md",
      type: "file"
    }
  ]
};

describe("FilesSidebar", () => {
  it("shows the workspace path at the top of the file sidebar", () => {
    render(
      <FilesSidebar
        tree={tree}
        workspacePath="/home/xmx/Developer/mini-agent"
        onSelect={vi.fn()}
        onRefresh={vi.fn()}
      />
    );

    expect(screen.getByText("/home/xmx/Developer/mini-agent")).toBeInTheDocument();
  });

  it("keeps directories collapsed by default and expands them on demand", async () => {
    render(<FilesSidebar tree={tree} onSelect={vi.fn()} onRefresh={vi.fn()} />);

    expect(screen.getByRole("button", { name: /src/ })).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("src/index.ts")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /src/ }));

    expect(screen.getByText("src/index.ts")).toBeInTheDocument();
  });
});
