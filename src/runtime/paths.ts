import { createHash } from "node:crypto";
import { mkdir, realpath, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export interface RuntimePathsOptions {
  home?: string;
  workspace?: string;
}

export class WorkspacePathError extends Error {
  readonly code = "invalid_workspace";

  constructor(workspace: string, detail: string) {
    super(`Invalid workspace "${workspace}": ${detail}`);
    this.name = "WorkspacePathError";
  }
}

export class RuntimePaths {
  readonly home: string;
  readonly configFile: string;
  readonly sessionsDir: string;
  readonly skillsDir: string;
  readonly scratchDir: string;
  readonly projectWorkspace: string;

  constructor(options: RuntimePathsOptions = {}) {
    this.home = resolveRuntimeHome(options.home);
    this.configFile = path.join(this.home, "config.json");
    this.sessionsDir = path.join(this.home, "sessions");
    this.skillsDir = path.join(this.home, "skills");
    this.scratchDir = path.join(this.home, "scratch");
    this.projectWorkspace = path.resolve(options.workspace ?? process.cwd());
  }

  async normalizeWorkspace(workspace: string): Promise<string> {
    try {
      const resolved = path.resolve(workspace);
      const canonical = await realpath(resolved);
      const info = await stat(canonical);
      if (!info.isDirectory()) throw new WorkspacePathError(workspace, "path is not a directory");
      return canonical;
    } catch (error) {
      if (error instanceof WorkspacePathError) throw error;
      throw new WorkspacePathError(workspace, error instanceof Error ? error.message : String(error));
    }
  }

  async effectiveWorkspace(workspace: unknown, sessionKey: string): Promise<string> {
    if (typeof workspace === "string" && workspace.trim()) {
      return this.normalizeWorkspace(workspace);
    }
    const id = createHash("sha256").update(sessionKey).digest("hex");
    const scratch = path.join(this.scratchDir, id);
    await mkdir(scratch, { recursive: true });
    return realpath(scratch);
  }

  legacyHome(): string {
    return path.join(this.projectWorkspace, ".mini-agent");
  }
}

export function resolveRuntimeHome(override?: string): string {
  return path.resolve(override ?? process.env.MINI_AGENT_HOME ?? path.join(os.homedir(), ".mini-agent"));
}
