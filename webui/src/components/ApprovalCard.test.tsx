import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import ApprovalCard from "./ApprovalCard";

describe("ApprovalCard", () => {
  it("sends approval decisions", async () => {
    const onResolve = vi.fn();
    render(<ApprovalCard approval={{ id: "1", command: "npm test" }} onResolve={onResolve} />);

    await userEvent.click(screen.getByRole("button", { name: "Approve" }));

    expect(onResolve).toHaveBeenCalledWith(true);
  });

  it("sends denial decisions", async () => {
    const onResolve = vi.fn();
    render(<ApprovalCard approval={{ id: "1", command: "npm run build" }} onResolve={onResolve} />);

    await userEvent.click(screen.getByRole("button", { name: "Deny" }));

    expect(onResolve).toHaveBeenCalledWith(false);
  });

  it("shows resolved approvals without action buttons", () => {
    render(<ApprovalCard approval={{ id: "1", command: "npm test", resolved: "approved" }} onResolve={vi.fn()} />);

    expect(screen.getByText("approved")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Approve" })).not.toBeInTheDocument();
  });
});
