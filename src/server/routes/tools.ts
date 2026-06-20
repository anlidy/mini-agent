import { createDefaultToolRegistry } from "../../tools/index.js";
import { json, type HttpRouter } from "../httpRouter.js";
import type { ConfigState } from "./config.js";

export function registerToolRoutes(router: HttpRouter, state: ConfigState): void {
  router.add("GET", "/api/tools", async (_req, res) => {
    const registry = createDefaultToolRegistry({ search: state.config.search, exec: state.config.exec });
    await json(res, registry.getDefinitions());
  });
}
