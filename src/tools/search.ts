import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

import type { Tool } from "./Tool.js";
import { shouldIgnore, truncate } from "./filesystem.js";
import { resolveWorkspacePath, toWorkspaceRelative } from "./path.js";

export function createSearchTools(): Tool[] {
  return [
    {
      name: "find_files",
      description: "Find workspace files by a simple glob-like pattern such as *.ts or README.md.",
      readOnly: true,
      parameters: {
        type: "object",
        properties: {
          pattern: { type: "string", minLength: 1 },
          path: { type: "string" },
          maxResults: { type: "integer", minimum: 1, maximum: 1000 }
        },
        required: ["pattern"]
      },
      async execute(args, context) {
        const root = resolveWorkspacePath(context.workspace, typeof args.path === "string" ? args.path : ".");
        const matcher = globMatcher(String(args.pattern));
        const files = await walkFiles(context.workspace, root, numberArg(args.maxResults, 200));
        const matches = files.filter((file) => matcher(path.basename(file)) || matcher(toWorkspaceRelative(context.workspace, file)));
        return matches.map((file) => toWorkspaceRelative(context.workspace, file)).join("\n") || "(no matches)";
      }
    },
    {
      name: "grep",
      description: "Search text files in the workspace for a literal string or JavaScript regular expression.",
      readOnly: true,
      parameters: {
        type: "object",
        properties: {
          pattern: { type: "string", minLength: 1 },
          path: { type: "string" },
          regex: { type: "boolean" },
          maxResults: { type: "integer", minimum: 1, maximum: 1000 }
        },
        required: ["pattern"]
      },
      async execute(args, context) {
        const root = resolveWorkspacePath(context.workspace, typeof args.path === "string" ? args.path : ".");
        const files = await walkFiles(context.workspace, root, 1000);
        const matcher = args.regex === true
          ? (line: string) => new RegExp(String(args.pattern)).test(line)
          : (line: string) => line.includes(String(args.pattern));
        const maxResults = numberArg(args.maxResults, 200);
        const results: string[] = [];

        for (const file of files) {
          if (results.length >= maxResults) {
            break;
          }
          let text: string;
          try {
            text = await readFile(file, "utf8");
          } catch {
            continue;
          }
          const lines = text.split(/\r?\n/);
          lines.forEach((line, index) => {
            if (results.length < maxResults && matcher(line)) {
              results.push(`${toWorkspaceRelative(context.workspace, file)}:${index + 1}:${line}`);
            }
          });
        }

        return truncate(results.join("\n") || "(no matches)");
      }
    }
  ];
}

async function walkFiles(workspace: string, root: string, maxFiles: number): Promise<string[]> {
  const results: string[] = [];
  async function visit(dir: string): Promise<void> {
    if (results.length >= maxFiles) {
      return;
    }
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (shouldIgnore(entry.name)) {
        continue;
      }
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await visit(fullPath);
      } else if (entry.isFile()) {
        const info = await stat(fullPath);
        if (info.size <= 2_000_000) {
          results.push(resolveWorkspacePath(workspace, toWorkspaceRelative(workspace, fullPath)));
        }
      }
      if (results.length >= maxFiles) {
        break;
      }
    }
  }
  await visit(root);
  return results;
}

function globMatcher(pattern: string): (value: string) => boolean {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*")
    .replace(/\?/g, ".");
  const regexp = new RegExp(`^${escaped}$`);
  return (value) => regexp.test(value);
}

function numberArg(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}
