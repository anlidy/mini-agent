import { HttpError, json, noContent, type HttpRouter } from "../httpRouter.js";
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

  router.add("DELETE", "/api/sessions/:key", async (_req, res, params) => {
    const key = params.key;
    if (!key) {
      throw new HttpError(400, "Missing session key");
    }
    await manager.deleteSession(key);
    await noContent(res);
  });
}
