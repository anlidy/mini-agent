import type { Tool } from "./Tool.js";
import { truncate } from "./filesystem.js";

export function createWebTools(fetchImpl: typeof fetch = fetch): Tool[] {
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
      description: "Search the web through a configured search endpoint. If unavailable, returns a clear error.",
      readOnly: true,
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", minLength: 1 }
        },
        required: ["query"]
      },
      async execute() {
        return "Error: web_search is not configured. Use web_fetch when you already have a URL.";
      }
    }
  ];
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
