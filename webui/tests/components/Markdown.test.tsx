import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import Markdown from "@/components/Markdown";

describe("Markdown", () => {
  it("renders plain text", () => {
    render(<Markdown>hello world</Markdown>);
    expect(screen.getByText("hello world")).toBeInTheDocument();
  });

  it("renders inline code", () => {
    render(<Markdown>use `const` keyword</Markdown>);
    const code = screen.getByText("const");
    expect(code.tagName).toBe("CODE");
  });

  it("renders fenced code blocks", () => {
    render(<Markdown>{"```ts\nconst x = 1;\n```"}</Markdown>);
    const pre = document.querySelector("pre");
    expect(pre).toBeTruthy();
    expect(pre?.textContent).toContain("const x = 1;");
  });

  it("renders headings", () => {
    render(<Markdown>{"# Title\n\n## Subtitle"}</Markdown>);
    expect(screen.getByText("Title").tagName).toBe("H1");
    expect(screen.getByText("Subtitle").tagName).toBe("H2");
  });

  it("renders lists", () => {
    render(<Markdown>{"- item 1\n- item 2"}</Markdown>);
    expect(screen.getByText("item 1")).toBeInTheDocument();
    expect(screen.getByText("item 2")).toBeInTheDocument();
  });

  it("renders links with target=_blank", () => {
    render(<Markdown>[click here](https://example.com)</Markdown>);
    const link = screen.getByText("click here");
    expect(link.getAttribute("href")).toBe("https://example.com");
    expect(link.getAttribute("target")).toBe("_blank");
  });

  it("renders blockquotes", () => {
    render(<Markdown>{"> quoted text"}</Markdown>);
    const bq = document.querySelector("blockquote");
    expect(bq).toBeTruthy();
    expect(bq?.textContent).toContain("quoted text");
  });

  it("renders bold text", () => {
    render(<Markdown>**important**</Markdown>);
    const strong = screen.getByText("important");
    expect(strong.tagName).toBe("STRONG");
  });

  it("renders tables", () => {
    render(<Markdown>{"| a | b |\n| --- | --- |\n| 1 | 2 |"}</Markdown>);
    expect(screen.getByText("a")).toBeInTheDocument();
    expect(screen.getByText("b")).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
  });
});
