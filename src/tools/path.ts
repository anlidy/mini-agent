import path from "node:path";

export function resolveWorkspacePath(workspace: string, target: string): string {
  return path.resolve(workspace, target);
}
