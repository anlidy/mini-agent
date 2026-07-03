import { useCallback, useEffect, useRef, useState } from "react";

export interface Project {
  id: string;
  name: string;
  sessionKeys: string[];
  createdAt: string;
}

const STORAGE_KEY = "mini-agent.projects";

function readProjects(): Project[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
}

function writeProjects(projects: Project[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
  } catch {
    // Ignore storage failures
  }
}

export function useProjects() {
  const [projects, setProjects] = useState<Project[]>(readProjects);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const persist = useCallback((next: Project[]) => {
    setProjects(next);
    writeProjects(next);
  }, []);

  const createProject = useCallback(
    (name: string): Project => {
      const project: Project = {
        id: crypto.randomUUID(),
        name: name.trim(),
        sessionKeys: [],
        createdAt: new Date().toISOString(),
      };
      const next = [...readProjects(), project];
      persist(next);
      return project;
    },
    [persist]
  );

  const deleteProject = useCallback(
    (projectId: string): void => {
      const next = readProjects().filter((p) => p.id !== projectId);
      persist(next);
    },
    [persist]
  );

  const renameProject = useCallback(
    (projectId: string, name: string): void => {
      const next = readProjects().map((p) =>
        p.id === projectId ? { ...p, name: name.trim() } : p
      );
      persist(next);
    },
    [persist]
  );

  const addSessionToProject = useCallback(
    (projectId: string, sessionKey: string): void => {
      const next = readProjects().map((p) => {
        if (p.id !== projectId) return p;
        if (p.sessionKeys.includes(sessionKey)) return p;
        return { ...p, sessionKeys: [...p.sessionKeys, sessionKey] };
      });
      persist(next);
    },
    [persist]
  );

  const removeSessionFromProject = useCallback(
    (projectId: string, sessionKey: string): void => {
      const next = readProjects().map((p) => {
        if (p.id !== projectId) return p;
        return { ...p, sessionKeys: p.sessionKeys.filter((k) => k !== sessionKey) };
      });
      persist(next);
    },
    [persist]
  );

  /** Return session keys grouped by project, plus orphan sessions (not in any project). */
  const getGrouped = useCallback(
    (allSessionKeys: string[]) => {
      const current = readProjects();
      const inProject = new Set<string>();
      const projectMap = new Map<string, string[]>();
      for (const p of current) {
        // Only include sessions that still exist
        const valid = p.sessionKeys.filter((k) => allSessionKeys.includes(k));
        projectMap.set(p.id, valid);
        valid.forEach((k) => inProject.add(k));
      }
      const orphans = allSessionKeys.filter((k) => !inProject.has(k));
      return { projects: current, projectMap, orphans };
    },
    []
  );

  return {
    projects,
    createProject,
    deleteProject,
    renameProject,
    addSessionToProject,
    removeSessionFromProject,
    getGrouped,
    refresh: useCallback(() => setProjects(readProjects()), []),
  };
}
