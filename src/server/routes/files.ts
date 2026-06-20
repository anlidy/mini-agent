import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

import { shouldIgnore } from "../../tools/filesystem.js";
import { resolveWorkspacePath, toWorkspaceRelative } from "../../tools/path.js";
import { HttpError, json, type HttpRouter } from "../httpRouter.js";

interface FileTreeNode {
  name: string;
  path: string;
  type: "file" | "directory";
  size?: number;
  children?: FileTreeNode[];
}

export function registerFileRoutes(router: HttpRouter, workspace: string): void {
  router.add("GET", "/api/files/tree", async (req, res) => {
    const requested = new URL(req.url ?? "/", "http://localhost").searchParams.get("path") ?? ".";
    const target = resolveWorkspacePath(workspace, requested);
    await json(res, await treeNode(workspace, target, 0));
  });

  router.add("GET", "/api/files/content", async (req, res) => {
    const requested = new URL(req.url ?? "/", "http://localhost").searchParams.get("path");
    if (!requested) {
      throw new HttpError(400, "Missing path");
    }
    const target = resolveWorkspacePath(workspace, requested);
    const fileStat = await stat(target);
    if (!fileStat.isFile()) {
      throw new HttpError(400, "Path is not a file");
    }
    await json(res, { path: toWorkspaceRelative(workspace, target), content: await readFile(target, "utf8") });
  });
}

async function treeNode(workspace: string, target: string, depth: number): Promise<FileTreeNode> {
  const fileStat = await stat(target);
  const name = path.basename(target) || ".";
  const node: FileTreeNode = {
    name,
    path: toWorkspaceRelative(workspace, target),
    type: fileStat.isDirectory() ? "directory" : "file",
    size: fileStat.isFile() ? fileStat.size : undefined
  };
  if (fileStat.isDirectory() && depth < 3) {
    const entries = await readdir(target, { withFileTypes: true });
    node.children = await Promise.all(entries
      .filter((entry) => !shouldIgnore(entry.name))
      .sort((left, right) => left.name.localeCompare(right.name))
      .map((entry) => treeNode(workspace, path.join(target, entry.name), depth + 1)));
  }
  return node;
}
