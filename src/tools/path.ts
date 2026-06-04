import path from "node:path";

export function resolveWorkspacePath(workspace: string, target = "."): string {
  const root = path.resolve(workspace);
  if (isDangerousPath(target)) {
    throw new Error(`Refusing dangerous path: ${target}`);
  }
  const resolved = path.resolve(root, target);
  const relative = path.relative(root, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Path escapes workspace: ${target}`);
  }
  return resolved;
}

export function toWorkspaceRelative(workspace: string, target: string): string {
  const relative = path.relative(path.resolve(workspace), target);
  return relative || ".";
}

function isDangerousPath(target: string): boolean {
  return target.startsWith("/dev") || target.startsWith("/proc") || target.startsWith("/sys");
}
