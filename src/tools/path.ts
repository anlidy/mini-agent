import path from "node:path";
import { realpath } from "node:fs/promises";

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

export function assertWorkspaceContains(workspace: string, target: string): void {
  const root = path.resolve(workspace);
  const relative = path.relative(root, path.resolve(target));
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Path escapes workspace: ${target}`);
  }
}

export async function resolveWorkspaceRealPath(workspace: string, target = ".", allowMissing = false): Promise<string> {
  const root = await realpath(path.resolve(workspace));
  const resolved = resolveWorkspacePath(root, target);
  try {
    const canonical = await realpath(resolved);
    assertWorkspaceContains(root, canonical);
    return canonical;
  } catch (error) {
    if (!allowMissing || !hasCode(error, "ENOENT")) throw error;
    let ancestor = path.dirname(resolved);
    while (true) {
      try {
        const canonicalAncestor = await realpath(ancestor);
        assertWorkspaceContains(root, canonicalAncestor);
        return resolved;
      } catch (ancestorError) {
        if (!hasCode(ancestorError, "ENOENT")) throw ancestorError;
        const parent = path.dirname(ancestor);
        if (parent === ancestor) throw ancestorError;
        ancestor = parent;
      }
    }
  }
}

function hasCode(error: unknown, code: string): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === code);
}

function isDangerousPath(target: string): boolean {
  return target.startsWith("/dev") || target.startsWith("/proc") || target.startsWith("/sys");
}
