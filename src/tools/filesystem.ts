import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import type { Tool } from "./Tool.js";
import { resolveWorkspacePath, toWorkspaceRelative } from "./path.js";

const DEFAULT_MAX_OUTPUT_CHARS = 64_000;

export function createFilesystemTools(): Tool[] {
  return [
    {
      name: "read_file",
      description: "Read a UTF-8 text file from the workspace.",
      readOnly: true,
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", minLength: 1 },
          maxChars: { type: "integer", minimum: 1, maximum: 200_000 }
        },
        required: ["path"]
      },
      async execute(args, context) {
        const target = resolveWorkspacePath(context.workspace, String(args.path));
        const text = await readFile(target, "utf8");
        return truncate(text, numberArg(args.maxChars, DEFAULT_MAX_OUTPUT_CHARS));
      }
    },
    {
      name: "write_file",
      description: "Write a UTF-8 text file inside the workspace, creating parent directories.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", minLength: 1 },
          content: { type: "string" }
        },
        required: ["path", "content"]
      },
      async execute(args, context) {
        const target = resolveWorkspacePath(context.workspace, String(args.path));
        await mkdir(path.dirname(target), { recursive: true });
        await writeFile(target, String(args.content), "utf8");
        return `Wrote ${toWorkspaceRelative(context.workspace, target)}`;
      }
    },
    {
      name: "list_dir",
      description: "List files and directories inside a workspace directory.",
      readOnly: true,
      parameters: {
        type: "object",
        properties: {
          path: { type: "string" },
          maxEntries: { type: "integer", minimum: 1, maximum: 1000 }
        }
      },
      async execute(args, context) {
        const target = resolveWorkspacePath(context.workspace, typeof args.path === "string" ? args.path : ".");
        const entries = await readdir(target, { withFileTypes: true });
        const maxEntries = numberArg(args.maxEntries, 200);
        const lines = await Promise.all(entries
          .filter((entry) => !shouldIgnore(entry.name))
          .slice(0, maxEntries)
          .map(async (entry) => {
            const fullPath = path.join(target, entry.name);
            const suffix = entry.isDirectory() ? "/" : "";
            return `${entry.name}${suffix}\t${entry.isDirectory() ? "dir" : "file"}\t${(await stat(fullPath)).size}`;
          }));
        return lines.join("\n") || "(empty)";
      }
    }
  ];
}

export function shouldIgnore(name: string): boolean {
  return [".git", "node_modules", "dist", "coverage", ".DS_Store"].includes(name);
}

export function truncate(text: string, maxChars = DEFAULT_MAX_OUTPUT_CHARS): string {
  return text.length > maxChars ? `${text.slice(0, maxChars)}... [truncated]` : text;
}

function numberArg(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}
