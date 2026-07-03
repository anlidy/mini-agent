import { HttpError, json, noContent, readJson, type HttpRouter } from "../httpRouter.js";
import { SessionManager } from "../../session/SessionManager.js";

export function registerSessionRoutes(router: HttpRouter, manager: SessionManager): void {
  router.add("GET", "/api/sessions", async (_req, res) => {
    await json(res, await manager.listSessions());
  });

  router.add("GET", "/api/sessions/:key", async (_req, res, params) => {
    const key = params.key;
    if (!key) {
      throw new HttpError(400, "Missing session key");
    }
    const session = await manager.getOrCreate(key);
    await json(res, session);
  });

  router.add("PATCH", "/api/sessions/:key", async (req, res, params) => {
    const key = params.key;
    if (!key) {
      throw new HttpError(400, "Missing session key");
    }
    const body = await readJson(req);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new HttpError(400, "Request body must be a JSON object");
    }
    const parsed = body as { title?: string; workspace?: string };
    const session = await manager.get(key);
    if (!session) {
      throw new HttpError(404, "Session not found");
    }
    if (typeof parsed.title === "string" && parsed.title.trim()) {
      session.metadata.title = parsed.title.trim();
    }
    if (typeof parsed.workspace === "string" && parsed.workspace.trim()) {
      session.metadata.workspace = parsed.workspace.trim();
    }
    if (typeof parsed.title !== "string" && typeof parsed.workspace !== "string") {
      throw new HttpError(400, "Request body must contain title or workspace");
    }
    await manager.save(session);
    await json(res, session);
  });

  router.add("DELETE", "/api/sessions/:key", async (_req, res, params) => {
    const key = params.key;
    if (!key) {
      throw new HttpError(400, "Missing session key");
    }
    await manager.deleteSession(key);
    await noContent(res);
  });
}
