import { createFilesystemTools } from "./filesystem.js";
import { createSearchTools } from "./search.js";
import { ToolRegistry } from "./ToolRegistry.js";
import { createWebTools } from "./web.js";

export function createDefaultToolRegistry(): ToolRegistry {
  const registry = new ToolRegistry();
  for (const tool of [
    ...createFilesystemTools(),
    ...createSearchTools(),
    ...createWebTools()
  ]) {
    registry.register(tool);
  }
  return registry;
}
