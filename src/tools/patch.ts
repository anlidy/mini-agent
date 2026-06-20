import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import type { Tool } from "./Tool.js";
import { resolveWorkspacePath, toWorkspaceRelative } from "./path.js";

interface Hunk {
  oldStart: number;
  contextAndRemoved: string[];
  contextAndAdded: string[];
}

interface ParsedPatch {
  targetPath: string;
  isNewFile: boolean;
  hunks: Hunk[];
}

export function createPatchTool(): Tool {
  return {
    name: "apply_patch",
    description: "Apply a unified-diff patch to a workspace file. Matches context lines (tolerant of small offsets). Set dryRun to preview without writing.",
    parameters: {
      type: "object",
      properties: {
        patch: { type: "string", minLength: 1 },
        path: { type: "string" },
        dryRun: { type: "boolean" }
      },
      required: ["patch"]
    },
    async execute(args, context) {
      let parsed: ParsedPatch;
      try {
        parsed = parsePatch(String(args.patch), typeof args.path === "string" ? args.path : undefined);
      } catch (error) {
        return `Error: ${error instanceof Error ? error.message : String(error)}`;
      }

      let target: string;
      try {
        target = resolveWorkspacePath(context.workspace, parsed.targetPath);
      } catch (error) {
        return `Error: ${error instanceof Error ? error.message : String(error)}`;
      }

      const original = parsed.isNewFile ? "" : await readFileOrEmpty(target);
      if (parsed.isNewFile && original.length > 0) {
        return `Error: patch creates ${parsed.targetPath} but the file already exists.`;
      }

      let applied: string;
      try {
        applied = applyHunks(original, parsed);
      } catch (error) {
        return `Error: ${error instanceof Error ? error.message : String(error)}`;
      }

      const relative = toWorkspaceRelative(context.workspace, target);
      if (args.dryRun === true) {
        return `Dry run for ${relative} (not written):\n${applied}`;
      }
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, applied, "utf8");
      return `Applied patch to ${relative}`;
    }
  };
}

async function readFileOrEmpty(target: string): Promise<string> {
  try {
    return await readFile(target, "utf8");
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return "";
    }
    throw error;
  }
}
// PATCH-MARKER

function parsePatch(patchText: string, pathOverride?: string): ParsedPatch {
  const lines = patchText.replace(/\r\n/g, "\n").split("\n");
  let sourcePath: string | undefined;
  let targetPath: string | undefined;
  const hunks: Hunk[] = [];
  let current: Hunk | undefined;

  for (const line of lines) {
    if (line.startsWith("--- ")) {
      sourcePath = stripDiffPrefix(line.slice(4).trim());
      current = undefined;
      continue;
    }
    if (line.startsWith("+++ ")) {
      targetPath = stripDiffPrefix(line.slice(4).trim());
      current = undefined;
      continue;
    }
    if (line.startsWith("@@")) {
      const match = /@@ -(\d+)(?:,\d+)? \+\d+(?:,\d+)? @@/.exec(line);
      current = { oldStart: match ? Number(match[1]) : 1, contextAndRemoved: [], contextAndAdded: [] };
      hunks.push(current);
      continue;
    }
    if (!current) {
      continue;
    }
    if (line.startsWith(" ")) {
      current.contextAndRemoved.push(line.slice(1));
      current.contextAndAdded.push(line.slice(1));
    } else if (line.startsWith("-")) {
      current.contextAndRemoved.push(line.slice(1));
    } else if (line.startsWith("+")) {
      current.contextAndAdded.push(line.slice(1));
    }
    // Any other line (e.g. "\ No newline at end of file") is ignored.
  }

  const resolvedTarget = pathOverride ?? (targetPath && targetPath !== "/dev/null" ? targetPath : undefined);
  if (!resolvedTarget) {
    throw new Error("patch has no target file path (expected a +++ header or path argument)");
  }
  if (hunks.length === 0) {
    throw new Error("patch contains no hunks");
  }
  const isNewFile = sourcePath === "/dev/null";
  return { targetPath: resolvedTarget, isNewFile, hunks };
}

/** Strip a leading a/ or b/ from a diff header path. */
function stripDiffPrefix(value: string): string {
  if (value === "/dev/null") {
    return value;
  }
  return value.replace(/^[ab]\//, "");
}
// PATCH-MARKER-2

function applyHunks(original: string, parsed: ParsedPatch): string {
  if (parsed.isNewFile) {
    const added = parsed.hunks.flatMap((hunk) => hunk.contextAndAdded);
    return `${added.join("\n")}\n`;
  }

  const endsWithNewline = original.length === 0 || original.endsWith("\n");
  const lines = original.length === 0 ? [] : original.replace(/\r\n/g, "\n").split("\n");
  if (endsWithNewline && lines.at(-1) === "") {
    lines.pop();
  }

  let offset = 0;
  for (const hunk of parsed.hunks) {
    const oldBlock = hunk.contextAndRemoved;
    const hint = Math.max(0, hunk.oldStart - 1 + offset);
    const at = findMatch(lines, oldBlock, hint);
    if (at < 0) {
      throw new Error(`hunk context did not match the file near line ${hunk.oldStart}`);
    }
    lines.splice(at, oldBlock.length, ...hunk.contextAndAdded);
    offset += hunk.contextAndAdded.length - oldBlock.length;
  }

  const body = lines.join("\n");
  return endsWithNewline ? `${body}\n` : body;
}

/**
 * Locate where `block` occurs in `lines`. Tries the hinted index first (cheap
 * and handles the common case), then an exact full-file scan, then a
 * whitespace-insensitive scan. Returns the start index or -1.
 */
function findMatch(lines: string[], block: string[], hint: number): number {
  if (block.length === 0) {
    return Math.min(hint, lines.length);
  }
  if (matchesAt(lines, block, hint, exactEquals)) {
    return hint;
  }
  const exact = scan(lines, block, exactEquals);
  if (exact >= 0) {
    return exact;
  }
  return scan(lines, block, trimmedEquals);
}

function scan(lines: string[], block: string[], eq: (a: string, b: string) => boolean): number {
  for (let index = 0; index + block.length <= lines.length; index += 1) {
    if (matchesAt(lines, block, index, eq)) {
      return index;
    }
  }
  return -1;
}

function matchesAt(lines: string[], block: string[], start: number, eq: (a: string, b: string) => boolean): boolean {
  if (start < 0 || start + block.length > lines.length) {
    return false;
  }
  for (let offset = 0; offset < block.length; offset += 1) {
    if (!eq(lines[start + offset] ?? "", block[offset] ?? "")) {
      return false;
    }
  }
  return true;
}

function exactEquals(a: string, b: string): boolean {
  return a === b;
}

function trimmedEquals(a: string, b: string): boolean {
  return a.trim() === b.trim();
}

