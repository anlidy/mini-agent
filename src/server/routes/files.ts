import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

import { shouldIgnore } from "../../tools/filesystem.js";
import { resolveWorkspaceRealPath, toWorkspaceRelative } from "../../tools/path.js";
import type { RuntimePaths } from "../../runtime/paths.js";
import type { SessionManager } from "../../session/SessionManager.js";
import { HttpError, json, type HttpRouter } from "../httpRouter.js";

interface FileTreeNode {
  name: string;
  path: string;
  type: "file" | "directory";
  size?: number;
  children?: FileTreeNode[];
}

export function registerFileRoutes(router: HttpRouter, sessions: SessionManager, paths: RuntimePaths): void {
  router.add("GET", "/api/sessions/:key/files/tree", async (req, res, params) => {
    const workspace = await sessionWorkspace(params.key, sessions, paths);
    const requested = new URL(req.url ?? "/", "http://localhost").searchParams.get("path") ?? ".";
    const target = await resolveWorkspaceRealPath(workspace, requested);
    await json(res, await treeNode(workspace, target, 0));
  });

  router.add("GET", "/api/sessions/:key/files/content", async (req, res, params) => {
    const workspace = await sessionWorkspace(params.key, sessions, paths);
    const requested = new URL(req.url ?? "/", "http://localhost").searchParams.get("path");
    if (!requested) throw new HttpError(400, "Missing path", "invalid_request");
    const target = await resolveWorkspaceRealPath(workspace, requested);
    const fileStat = await stat(target);
    if (!fileStat.isFile()) throw new HttpError(400, "Path is not a file", "invalid_request");
    await json(res, { path: toWorkspaceRelative(workspace, target), content: await readFile(target, "utf8") });
  });
}

async function sessionWorkspace(key: string | undefined, sessions: SessionManager, paths: RuntimePaths): Promise<string> {
  if (!key) throw new HttpError(400, "Missing session key", "invalid_request");
  const session = await sessions.get(key);
  if (!session) throw new HttpError(404, "Session not found", "session_not_found");
  return paths.effectiveWorkspace(session.metadata.workspace, key);
}

async function treeNode(workspace: string, target: string, depth: number): Promise<FileTreeNode> {
  target = await resolveWorkspaceRealPath(workspace, toWorkspaceRelative(workspace, target));
  const fileStat = await stat(target);
  const node: FileTreeNode = {
    name: path.basename(target) || ".",
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
