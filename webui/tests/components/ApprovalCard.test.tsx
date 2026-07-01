import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import ApprovalCard from "@/components/ApprovalCard";

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

  it("does not render when already resolved", () => {
    const { container } = render(
      <ApprovalCard approval={{ id: "1", command: "npm test", resolved: "approved" }} onResolve={vi.fn()} />
    );

    expect(container).toBeEmptyDOMElement();
  });
});
