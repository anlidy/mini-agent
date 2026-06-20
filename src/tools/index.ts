import { createFilesystemTools } from "./filesystem.js";
import { createExecTool, type ExecToolOptions } from "./exec.js";
import { createPatchTool } from "./patch.js";
import { createSearchTools } from "./search.js";
import { ToolRegistry } from "./ToolRegistry.js";
import { createWebTools, type WebSearchConfig } from "./web.js";

export interface ExecConfig extends ExecToolOptions {
  enabled: boolean;
}

export interface ToolRegistryOptions {
  search?: WebSearchConfig;
  exec?: ExecConfig;
  fetch?: typeof fetch;
}

export function createDefaultToolRegistry(options: ToolRegistryOptions = {}): ToolRegistry {
  const registry = new ToolRegistry();
  const tools = [
    ...createFilesystemTools(),
    ...createSearchTools(),
    ...createWebTools({ fetch: options.fetch, search: options.search }),
    // apply_patch writes only inside the workspace (same risk as write_file).
    createPatchTool()
  ];
  // exec runs arbitrary shell commands, so it is opt-in via config (default off).
  if (options.exec?.enabled) {
    tools.push(createExecTool({ timeoutMs: options.exec.timeoutMs, maxOutputChars: options.exec.maxOutputChars }));
  }
  for (const tool of tools) {
    registry.register(tool);
  }
  return registry;
}
