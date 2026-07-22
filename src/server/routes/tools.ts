import { createDefaultToolRegistry } from "../../tools/index.js";
import { json, type HttpRouter } from "../httpRouter.js";
import type { ConfigState } from "./config.js";
import { createReadSkillTool } from "../../tools/skills.js";

export function registerToolRoutes(router: HttpRouter, state: ConfigState, globalSkillsDir: string): void {
  router.add("GET", "/api/tools", async (_req, res) => {
    const registry = createDefaultToolRegistry({
      search: state.config.tools.search,
      exec: state.config.tools.exec
    });
    registry.register(createReadSkillTool(globalSkillsDir));
    await json(res, registry.getDefinitions());
  });
}
