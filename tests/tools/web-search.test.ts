import { describe, expect, it } from "vitest";

import { createWebTools } from "../../src/tools/web.js";

const DDG_HTML = `
<div class="result results_links results_links_deep web-result">
  <h2 class="result__title">
    <a rel="nofollow" class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fdocs&rut=abc">Example Docs</a>
  </h2>
  <a class="result__snippet" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fdocs">The official docs for Example &amp; friends.</a>
</div>
<div class="result results_links results_links_deep web-result">
  <h2 class="result__title">
    <a rel="nofollow" class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.org%2Fblog">Example Blog</a>
  </h2>
  <a class="result__snippet">A blog about examples.</a>
</div>
`;

function htmlResponse(body: string, init: { ok?: boolean; status?: number } = {}): Response {
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    statusText: "OK",
    async text() {
      return body;
    }
  } as Response;
}

function webSearchTool(fetchImpl: typeof fetch, maxResults = 5) {
  const tools = createWebTools({ fetch: fetchImpl, search: { backend: "duckduckgo", maxResults } });
  const tool = tools.find((candidate) => candidate.name === "web_search");
  if (!tool) {
    throw new Error("web_search tool missing");
  }
  return tool;
}

describe("web_search tool", () => {
  it("returns an explanatory error when the backend is 'none'", async () => {
    const tools = createWebTools({ search: { backend: "none" } });
    const tool = tools.find((candidate) => candidate.name === "web_search")!;
    await expect(tool.execute({ query: "anything" }, { workspace: "/tmp" }))
      .resolves.toContain("not configured");
  });

  it("queries DuckDuckGo and parses title/url/snippet results", async () => {
    const calls: string[] = [];
    const tool = webSearchTool(async (url) => {
      calls.push(String(url));
      return htmlResponse(DDG_HTML);
    });

    const result = String(await tool.execute({ query: "example docs" }, { workspace: "/tmp" }));

    expect(calls[0]).toContain("html.duckduckgo.com/html/");
    expect(calls[0]).toContain("q=example%20docs");
    expect(result).toContain("Example Docs");
    expect(result).toContain("https://example.com/docs");
    expect(result).toContain("The official docs for Example & friends.");
    expect(result).toContain("Example Blog");
    expect(result).toContain("https://example.org/blog");
  });

  it("respects maxResults", async () => {
    const tool = webSearchTool(async () => htmlResponse(DDG_HTML), 1);
    const result = String(await tool.execute({ query: "example" }, { workspace: "/tmp" }));
    expect(result).toContain("Example Docs");
    expect(result).not.toContain("Example Blog");
  });

  it("returns a model-friendly error on a non-2xx response instead of throwing", async () => {
    const tool = webSearchTool(async () => htmlResponse("nope", { ok: false, status: 503 }));
    await expect(tool.execute({ query: "example" }, { workspace: "/tmp" }))
      .resolves.toContain("Error");
  });

  it("returns a clear message when there are no results", async () => {
    const tool = webSearchTool(async () => htmlResponse("<div>no results here</div>"));
    await expect(tool.execute({ query: "zzz" }, { workspace: "/tmp" }))
      .resolves.toContain("No results");
  });
});
