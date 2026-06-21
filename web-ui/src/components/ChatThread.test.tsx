import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import ChatThread from "./ChatThread";

describe("ChatThread", () => {
  it("renders the abort control in the composer action while a turn is active", async () => {
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

    await userEvent.click(screen.getByRole("button", { name: "Abort turn" }));

    expect(onAbort).toHaveBeenCalledOnce();
  });

  it("renders persisted session history in the chat surface", () => {
    render(
      <ChatThread
        sessionKey="default"
        messages={[
          {
            role: "user",
            content: "old user message",
            timestamp: "2026-06-21T00:00:00.000Z"
          },
          {
            role: "assistant",
            content: "old assistant message",
            timestamp: "2026-06-21T00:00:01.000Z"
          }
        ]}
        assistantDraft="live response"
        steps={[]}
        connected={true}
        active={false}
        aborting={false}
        onSend={vi.fn()}
        onApprove={vi.fn()}
        onAbort={vi.fn()}
      />
    );

    expect(screen.getByText("old user message")).toBeInTheDocument();
    expect(screen.getByText("old assistant message")).toBeInTheDocument();
    expect(screen.getByText("live response")).toBeInTheDocument();
  });

  it("shows the submitted user message for the active turn", async () => {
    const onSend = vi.fn(() => true);
    render(
      <ChatThread
        sessionKey="default"
        messages={[]}
        assistantDraft=""
        steps={[]}
        connected={true}
        active={false}
        aborting={false}
        onSend={onSend}
        onApprove={vi.fn()}
        onAbort={vi.fn()}
      />
    );

    await userEvent.type(screen.getByPlaceholderText(/Ask mini-agent/), "inspect this file");
    await userEvent.click(screen.getByRole("button", { name: "Send" }));

    const userArticle = screen.getByText("You").closest("article");

    expect(userArticle).not.toBeNull();
    expect(userArticle).toHaveTextContent("inspect this file");
  });
});
