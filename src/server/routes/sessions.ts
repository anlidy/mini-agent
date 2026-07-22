import { HttpError, json, noContent, readJson, type HttpRouter } from "../httpRouter.js";
import { SessionBusyError, SessionManager } from "../../session/SessionManager.js";
import type { Session, SessionMetadata } from "../../session/Session.js";
import type { RuntimePaths } from "../../runtime/paths.js";

export function registerSessionRoutes(router: HttpRouter, manager: SessionManager, paths: RuntimePaths): void {
  router.add("GET", "/api/sessions", async (_req, res) => {
    const summaries = await manager.listSessions();
    await json(res, await Promise.all(summaries.map(async (summary) => ({
      ...summary,
      effectiveWorkspace: await paths.effectiveWorkspace(summary.workspace, summary.key)
    }))));
  });

  router.add("POST", "/api/sessions", async (req, res) => {
    const body = asObject(await readJson(req));
    const key = body.key === undefined ? undefined : requireString(body.key, "key");
    const metadata: SessionMetadata = {};
    if (body.workspace !== undefined && body.workspace !== null) {
      metadata.workspace = await paths.normalizeWorkspace(requireString(body.workspace, "workspace"));
    }
    const session = await manager.create(key, metadata);
    await json(res, await withEffectiveWorkspace(session, paths), 201);
  });

  router.add("GET", "/api/sessions/:key", async (_req, res, params) => {
    const key = requireKey(params.key);
    const session = await manager.get(key);
    if (!session) throw new HttpError(404, "Session not found", "session_not_found");
    await json(res, await withEffectiveWorkspace(session, paths));
  });

  router.add("PATCH", "/api/sessions/:key", async (req, res, params) => {
    const key = requireKey(params.key);
    if (manager.isBusy(key)) throw new SessionBusyError(key);
    const body = asObject(await readJson(req));
    if (!Number.isInteger(body.revision) || (body.revision as number) < 0) {
      throw new HttpError(400, "Request body must contain a non-negative revision", "invalid_revision");
    }
    const session = await manager.get(key);
    if (!session) throw new HttpError(404, "Session not found", "session_not_found");
    session.revision = body.revision as number;
    let changed = false;
    if (body.title !== undefined) {
      const title = requireString(body.title, "title").trim();
      if (!title) throw new HttpError(400, "title must not be empty", "invalid_request");
      session.metadata.title = title;
      changed = true;
    }
    if (body.workspace === null) {
      delete session.metadata.workspace;
      changed = true;
    } else if (body.workspace !== undefined) {
      session.metadata.workspace = await paths.normalizeWorkspace(requireString(body.workspace, "workspace"));
      changed = true;
    }
    if (!changed) throw new HttpError(400, "Request body must contain title or workspace", "invalid_request");
    await json(res, await withEffectiveWorkspace(await manager.save(session), paths));
  });

  router.add("DELETE", "/api/sessions/:key", async (_req, res, params) => {
    await manager.deleteSession(requireKey(params.key));
    await noContent(res);
  });
}

async function withEffectiveWorkspace(session: Session, paths: RuntimePaths): Promise<Session & { effectiveWorkspace: string }> {
  return { ...session, effectiveWorkspace: await paths.effectiveWorkspace(session.metadata.workspace, session.key) };
}

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new HttpError(400, "Request body must be a JSON object", "invalid_request");
  }
  return value as Record<string, unknown>;
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new HttpError(400, `${field} must be a non-empty string`, "invalid_request");
  }
  return value.trim();
}

function requireKey(key?: string): string {
  if (!key) throw new HttpError(400, "Missing session key", "invalid_request");
  return key;
}
