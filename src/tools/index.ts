import { createFilesystemTools } from "./filesystem.js";
import { createSearchTools } from "./search.js";
import { ToolRegistry } from "./ToolRegistry.js";
import { createWebTools, type WebSearchConfig } from "./web.js";

export interface ToolRegistryOptions {
  search?: WebSearchConfig;
  fetch?: typeof fetch;
}

export function createDefaultToolRegistry(options: ToolRegistryOptions = {}): ToolRegistry {
  const registry = new ToolRegistry();
  for (const tool of [
    ...createFilesystemTools(),
    ...createSearchTools(),
    ...createWebTools({ fetch: options.fetch, search: options.search })
  ]) {
    registry.register(tool);
  }
  return registry;
}
