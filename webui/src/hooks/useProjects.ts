import { useCallback } from "react";

import type { SessionSummary } from "../api/types";

export interface Project {
  id: string;
  name: string;
  sessionKeys: string[];
}

/** Derive projects from session workspace metadata.
 * Sessions with the default workspace (or no workspace) are orphans.
 * Sessions with other workspaces are grouped into projects by workspace path.
 */
export function useProjects() {
  const getGrouped = useCallback(
    (sessions: SessionSummary[]) => {
      const projectMap = new Map<string, string[]>();

      for (const s of sessions) {
        const ws = s.workspace;
        if (ws) {
          const keys = projectMap.get(ws) ?? [];
          keys.push(s.key);
          projectMap.set(ws, keys);
        }
      }

      const inProject = new Set<string>();
      const projects: Project[] = [];
      for (const [workspace, keys] of projectMap) {
        keys.forEach((k) => inProject.add(k));
        projects.push({
          id: workspace,
          name: workspace.split("/").pop() || workspace,
          sessionKeys: keys,
        });
      }

      const orphans = sessions.map((s) => s.key).filter((k) => !inProject.has(k));

      return { projects, projectMap, orphans };
    },
    []
  );

  return { getGrouped };
}
