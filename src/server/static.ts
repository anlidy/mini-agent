import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";

import { HttpError, writeError } from "./httpRouter.js";

const TYPES: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml"
};

export async function serveStatic(req: IncomingMessage, res: ServerResponse, root: string): Promise<void> {
  const pathname = decodeURIComponent(new URL(req.url ?? "/", "http://localhost").pathname);
  const requested = pathname === "/" ? "index.html" : pathname.slice(1);
  let target = path.resolve(root, requested);
  if (!inside(root, target)) {
    await writeError(res, new HttpError(403, "Path escapes static root"));
    return;
  }

  let fileStat = await stat(target).catch(() => undefined);
  if (!fileStat?.isFile()) {
    target = path.join(root, "index.html");
    fileStat = await stat(target).catch(() => undefined);
  }
  if (!fileStat?.isFile()) {
    await writeError(res, new HttpError(404, "Not found"));
    return;
  }

  res.writeHead(200, {
    "content-type": TYPES[path.extname(target)] ?? "application/octet-stream",
    "content-length": fileStat.size
  });
  createReadStream(target).pipe(res);
}

function inside(root: string, target: string): boolean {
  const relative = path.relative(path.resolve(root), target);
  return !relative.startsWith("..") && !path.isAbsolute(relative);
}
