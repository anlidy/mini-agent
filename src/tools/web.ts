import type { Tool } from "./Tool.js";
import { truncate } from "./filesystem.js";

export interface WebSearchConfig {
  backend: "duckduckgo" | "none";
  maxResults?: number;
}

export interface CreateWebToolsOptions {
  fetch?: typeof fetch;
  search?: WebSearchConfig;
}

const DEFAULT_MAX_RESULTS = 5;
const DUCKDUCKGO_ENDPOINT = "https://html.duckduckgo.com/html/";

export function createWebTools(options: CreateWebToolsOptions = {}): Tool[] {
  const fetchImpl = options.fetch ?? fetch;
  const search = options.search ?? { backend: "none" };
  return [
    {
      name: "web_fetch",
      description: "Fetch an http(s) URL and return text content with an external content banner.",
      readOnly: true,
      parameters: {
        type: "object",
        properties: {
          url: { type: "string", minLength: 1 },
          maxChars: { type: "integer", minimum: 1, maximum: 200_000 }
        },
        required: ["url"]
      },
      async execute(args) {
        const url = validateHttpUrl(String(args.url));
        const response = await fetchImpl(url, { redirect: "follow" });
        if (!response.ok) {
          return `Error: HTTP ${response.status} ${response.statusText}`;
        }
        const text = await response.text();
        const contentType = response.headers.get("content-type") ?? "";
        const body = contentType.includes("html") ? htmlToText(text) : text;
        const maxChars = typeof args.maxChars === "number" ? args.maxChars : 64_000;
        return truncate(`[External content from ${url}]\n${body}`, maxChars);
      }
    },
    {
      name: "web_search",
      description: "Search the web through a configured search backend. Returns ranked title/url/snippet results.",
      readOnly: true,
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", minLength: 1 },
          maxResults: { type: "integer", minimum: 1, maximum: 20 }
        },
        required: ["query"]
      },
      async execute(args) {
        if (search.backend === "none") {
          return "Error: web_search is not configured. Set search.backend in .mini-agent/config.json (e.g. \"duckduckgo\"), or use web_fetch when you already have a URL.";
        }
        const query = String(args.query);
        const limit = clampResults(typeof args.maxResults === "number" ? args.maxResults : search.maxResults);
        return duckDuckGoSearch(fetchImpl, query, limit);
      }
    }
  ];
}
// APPEND-MARKER

function clampResults(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_MAX_RESULTS;
  }
  return Math.max(1, Math.min(20, Math.floor(value)));
}

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

async function duckDuckGoSearch(fetchImpl: typeof fetch, query: string, maxResults: number): Promise<string> {
  let response: Response;
  try {
    response = await fetchImpl(`${DUCKDUCKGO_ENDPOINT}?q=${encodeURIComponent(query)}`, {
      method: "GET",
      headers: { "user-agent": "Mozilla/5.0 (compatible; mini-agent/0.1)" },
      redirect: "follow"
    });
  } catch (error) {
    return `Error: web_search request failed: ${error instanceof Error ? error.message : String(error)}`;
  }
  if (!response.ok) {
    return `Error: web_search returned HTTP ${response.status} ${response.statusText}`;
  }
  const html = await response.text();
  const results = parseDuckDuckGoHtml(html, maxResults);
  if (results.length === 0) {
    return `No results for "${query}".`;
  }
  return results
    .map((result, index) => `${index + 1}. ${result.title}\n   ${result.url}${result.snippet ? `\n   ${result.snippet}` : ""}`)
    .join("\n\n");
}
// APPEND-MARKER-2

const RESULT_ANCHOR = /<a\b[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
const SNIPPET_ANCHOR = /<a\b[^>]*class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/gi;

function parseDuckDuckGoHtml(html: string, maxResults: number): SearchResult[] {
  const snippets: string[] = [];
  for (const match of html.matchAll(SNIPPET_ANCHOR)) {
    snippets.push(decodeEntities(stripTags(match[1] ?? "")));
  }
  const results: SearchResult[] = [];
  let index = 0;
  for (const match of html.matchAll(RESULT_ANCHOR)) {
    if (results.length >= maxResults) {
      break;
    }
    const url = resolveDuckDuckGoUrl(match[1] ?? "");
    const title = decodeEntities(stripTags(match[2] ?? "")).trim();
    if (!url || !title) {
      index += 1;
      continue;
    }
    results.push({ title, url, snippet: snippets[index] ?? "" });
    index += 1;
  }
  return results;
}

/** DuckDuckGo wraps targets in /l/?uddg=<encoded>; unwrap to the real URL. */
function resolveDuckDuckGoUrl(href: string): string {
  const normalized = href.startsWith("//") ? `https:${href}` : href;
  try {
    const parsed = new URL(normalized, "https://duckduckgo.com");
    const target = parsed.searchParams.get("uddg");
    if (target) {
      return target;
    }
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.toString() : "";
  } catch {
    return "";
  }
}

function stripTags(value: string): string {
  return value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function decodeEntities(value: string): string {
  return value
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, "\"");
}

function validateHttpUrl(value: string): string {
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("Only http and https URLs are allowed");
  }
  if (["localhost", "127.0.0.1", "::1"].includes(url.hostname)) {
    throw new Error("Refusing local network URL");
  }
  return url.toString();
}

function htmlToText(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

