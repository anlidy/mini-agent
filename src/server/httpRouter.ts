import type { IncomingMessage, ServerResponse } from "node:http";

export type Params = Record<string, string>;
export type Handler = (req: IncomingMessage, res: ServerResponse, params: Params) => Promise<void> | void;

interface Route {
  method: string;
  path: string;
  parts: string[];
  handler: Handler;
}

export class HttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
    this.name = "HttpError";
  }
}

export class HttpRouter {
  private readonly routes: Route[] = [];

  add(method: string, path: string, handler: Handler): void {
    this.routes.push({ method: method.toUpperCase(), path, parts: splitPath(path), handler });
  }

  async handle(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
    const method = req.method?.toUpperCase() ?? "GET";
    const pathname = new URL(req.url ?? "/", "http://localhost").pathname;
    const requestParts = splitPath(pathname);

    for (const route of this.routes) {
      if (route.method !== method) {
        continue;
      }
      const params = matchParts(route.parts, requestParts);
      if (!params) {
        continue;
      }
      try {
        await route.handler(req, res, params);
      } catch (error) {
        await writeError(res, error);
      }
      return true;
    }

    if (pathname.startsWith("/api/")) {
      await writeError(res, new HttpError(404, "Not found"));
      return true;
    }
    return false;
  }
}

export async function readJson(req: IncomingMessage): Promise<unknown> {
  let body = "";
  for await (const chunk of req) {
    body += chunk.toString();
    if (body.length > 1_000_000) {
      throw new HttpError(400, "Request body too large");
    }
  }
  if (!body.trim()) {
    return {};
  }
  try {
    return JSON.parse(body) as unknown;
  } catch (error) {
    throw new HttpError(400, `Invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function json(res: ServerResponse, value: unknown, status = 200): Promise<void> {
  const body = JSON.stringify(value);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body)
  });
  res.end(body);
}

export async function noContent(res: ServerResponse): Promise<void> {
  res.writeHead(204);
  res.end();
}

export async function writeError(res: ServerResponse, error: unknown): Promise<void> {
  const status = error instanceof HttpError ? error.status : statusFromError(error);
  const message = error instanceof Error ? error.message : String(error);
  await json(res, { error: message }, status);
}

function splitPath(path: string): string[] {
  return path.split("/").filter(Boolean);
}

function matchParts(routeParts: string[], requestParts: string[]): Params | undefined {
  if (routeParts.length !== requestParts.length) {
    return undefined;
  }
  const params: Params = {};
  for (let index = 0; index < routeParts.length; index += 1) {
    const routePart = routeParts[index] ?? "";
    const requestPart = requestParts[index] ?? "";
    if (routePart.startsWith(":")) {
      params[routePart.slice(1)] = decodeURIComponent(requestPart);
    } else if (routePart !== requestPart) {
      return undefined;
    }
  }
  return params;
}

function statusFromError(error: unknown): number {
  if (error instanceof Error && error.message.startsWith("Path escapes workspace:")) {
    return 403;
  }
  if (error instanceof Error && error.message.startsWith("Refusing dangerous path:")) {
    return 403;
  }
  return 500;
}
