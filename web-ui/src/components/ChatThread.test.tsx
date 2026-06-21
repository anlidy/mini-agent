import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import ChatThread from "./ChatThread";

describe("ChatThread", () => {
  it("renders an abort control while a turn is active", async () => {
    const onAbort = vi.fn();
    render(
      <ChatThread
        sessionKey="default"
        messages={[]}
        assistantDraft=""
        steps={[]}
        connected={true}
        active={true}
        aborting={false}
        onSend={vi.fn()}
        onApprove={vi.fn()}
        onAbort={onAbort}
      />
    );

    await userEvent.click(screen.getByRole("button", { name: "Abort" }));

    expect(onAbort).toHaveBeenCalledOnce();
  });
});
