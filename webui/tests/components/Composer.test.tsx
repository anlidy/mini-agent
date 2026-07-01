import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import Composer from "@/components/Composer";

describe("Composer", () => {
  it("sends trimmed text on Enter and keeps the draft until parent clears it", async () => {
    const onSend = vi.fn();
    const { rerender } = render(<Composer disabled={false} value="" onChange={vi.fn()} onSend={onSend} />);

    rerender(<Composer disabled={false} value="  hello  " onChange={vi.fn()} onSend={onSend} />);
    await userEvent.type(screen.getByPlaceholderText(/Ask mini-agent/), "{enter}");

    expect(onSend).toHaveBeenCalledWith("hello");
    expect(screen.getByPlaceholderText(/Ask mini-agent/)).toHaveValue("  hello  ");
  });

  it("keeps newlines on Shift+Enter", async () => {
    const onSend = vi.fn();
    const onChange = vi.fn();
    render(<Composer disabled={false} value="" onChange={onChange} onSend={onSend} />);

    await userEvent.type(screen.getByPlaceholderText(/Ask mini-agent/), "hello{shift>}{enter}{/shift}world");

    expect(onSend).not.toHaveBeenCalled();
    expect(onChange).toHaveBeenCalled();
  });

  it("does not send while disabled", async () => {
    const onSend = vi.fn();
    render(<Composer disabled={true} value="hello" onChange={vi.fn()} onSend={onSend} />);

    await userEvent.type(screen.getByPlaceholderText(/Ask mini-agent/), "hello{enter}");

    expect(onSend).not.toHaveBeenCalled();
  });

  it("uses the send button position for abort while active", async () => {
    const onAbort = vi.fn();
    render(
      <Composer
        disabled={true}
        value="hello"
        onChange={vi.fn()}
        onSend={vi.fn()}
        {...{ active: true, aborting: false, onAbort }}
      />
    );

    expect(screen.queryByRole("button", { name: "Send" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Abort turn" }));

    expect(onAbort).toHaveBeenCalledOnce();
  });
});
