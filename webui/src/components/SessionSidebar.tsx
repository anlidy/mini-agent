import { useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Brain,
  ChevronLeft,
  Folder,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Settings,
  SquarePen,
  Trash2,
  FolderPlus,
  LogOut,
} from "lucide-react";

import type { SessionSummary } from "../api/types";
import type { Project } from "../hooks/useProjects";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import {
  Popover,
  PopoverContent,
  PopoverItem,
  PopoverTrigger,
} from "./ui/popover";

interface SessionSidebarProps {
  sessions: SessionSummary[];
  activeKey: string;
  onSelect(key: string): void;
  onNew(): void;
  onToggleCollapse(): void;
  onDelete(key: string): Promise<void>;
  onRename(key: string, name: string): void;
  getDisplayName(key: string): string;
  projects: Project[];
  projectMap: Map<string, string[]>;
  orphans: string[];
  onCreateProject(name: string): Project;
  onDeleteProject(projectId: string): void;
  onAddToProject(projectId: string, sessionKey: string): void;
  onRemoveFromProject(projectId: string, sessionKey: string): void;
  collapsed?: boolean;
}

export default function SessionSidebar({
  sessions,
  activeKey,
  onSelect,
  onNew,
  onToggleCollapse,
  onDelete,
  onRename,
  getDisplayName,
  projects,
  projectMap,
  orphans,
  onCreateProject,
  onDeleteProject,
  onAddToProject,
  onRemoveFromProject,
  collapsed = false,
}: SessionSidebarProps) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(
    () => new Set(projects.map((p) => p.id))
  );
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return { projects, projectMap, orphans };

    const filteredProjectMap = new Map<string, string[]>();
    for (const [projectId, keys] of projectMap) {
      const project = projects.find((p) => p.id === projectId);
      const projectMatch = project?.name.toLowerCase().includes(q);
      const matchingKeys = keys.filter((k) => {
        const name = getDisplayName(k).toLowerCase();
        return projectMatch || name.includes(q);
      });
      if (matchingKeys.length > 0 || projectMatch) {
        filteredProjectMap.set(projectId, matchingKeys.length > 0 ? matchingKeys : keys);
      }
    }

    const filteredOrphans = orphans.filter((k) => {
      const name = getDisplayName(k).toLowerCase();
      return name.includes(q);
    });

    return { projects, projectMap: filteredProjectMap, orphans: filteredOrphans };
  }, [query, projects, projectMap, orphans, getDisplayName]);

  const toggleProject = (projectId: string) => {
    setExpandedProjects((prev) => {
      const next = new Set(prev);
      if (next.has(projectId)) {
        next.delete(projectId);
      } else {
        next.add(projectId);
      }
      return next;
    });
  };

  const startRename = (key: string) => {
    setRenaming(key);
    setRenameValue(getDisplayName(key));
  };

  const submitRename = (key: string) => {
    if (renameValue.trim()) {
      onRename(key, renameValue.trim());
    }
    setRenaming(null);
    setRenameValue("");
  };

  const cancelRename = () => {
    setRenaming(null);
    setRenameValue("");
  };

  const handleNewInProject = (projectId: string) => {
    const newKey = crypto.randomUUID();
    onAddToProject(projectId, newKey);
    onSelect(newKey);
  };

  /* ── Collapsed: icon-only strip ─────────────────────────────── */
  if (collapsed) {
    return (
      <div className="flex h-full flex-col items-center bg-sidebar py-4 gap-3">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Expand panel"
          onClick={onToggleCollapse}
          type="button"
          className="text-ink-muted hover:text-ink"
        >
          <ChevronLeft size={18} />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="New session"
          onClick={onNew}
          type="button"
          className="text-ink-muted hover:text-ink"
        >
          <SquarePen size={18} />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Skills"
          type="button"
          className="text-ink-muted hover:text-ink"
        >
          <Brain size={18} />
        </Button>
        <div className="flex-1" />
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Settings"
          onClick={() => navigate("/settings")}
          type="button"
          className="text-ink-muted hover:text-ink"
        >
          <Settings size={18} />
        </Button>
      </div>
    );
  }

  /* ── Expanded: full sidebar ─────────────────────────────────── */
  return (
    <div className="flex h-full flex-col bg-sidebar">
      {/* Header */}
      <div className="flex h-12 items-center justify-between px-3">
        <span className="text-[15px] font-semibold tracking-tight text-ink">
          Agent
        </span>
        <div className="flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Search sessions"
            onClick={() => {
              setShowSearch(!showSearch);
              if (showSearch) setQuery("");
            }}
            type="button"
            className="text-ink-muted hover:text-ink"
          >
            <Search size={16} />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Collapse panel"
            onClick={onToggleCollapse}
            type="button"
            className="text-ink-muted hover:text-ink"
          >
            <ChevronLeft size={18} />
          </Button>
        </div>
      </div>

      {/* Search */}
      {showSearch && (
        <div className="px-3 pb-2">
          <div className="flex items-center gap-2 rounded-xl border border-line/30 bg-surface px-3 py-1.5 transition-colors duration-fast focus-within:border-accent/40 focus-within:ring-2 focus-within:ring-ring/30">
            <Search size={14} className="shrink-0 text-ink-muted" />
            <Input
              className="h-auto border-0 bg-transparent p-0 text-[13px] shadow-none focus-visible:ring-0"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索对话..."
              type="text"
              autoFocus
            />
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="px-2 pb-2">
        <div className="space-y-0.5">
          <button
            className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[13px] font-medium leading-6 text-ink transition-colors duration-fast hover:bg-muted"
            onClick={onNew}
            type="button"
          >
            <SquarePen size={16} className="shrink-0 text-ink-secondary" />
            <span>新建对话</span>
          </button>
          <button
            className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[13px] font-medium leading-6 text-ink transition-colors duration-fast hover:bg-muted"
            type="button"
          >
            <Brain size={16} className="shrink-0 text-ink-secondary" />
            <span>技能</span>
          </button>
        </div>
      </div>

      {/* Divider */}
      <div className="mx-3 border-t border-line/20" />

      {/* Session list */}
      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        {filtered.projects.length === 0 && filtered.orphans.length === 0 && (
          <div className="mt-8 text-center text-[12px] text-ink-muted">
            {query.trim() ? "没有匹配的对话" : "暂无对话"}
          </div>
        )}

        {filtered.projects.length > 0 && (
          <div className="mb-3">
            <div className="mb-1.5 px-2 text-[11px] font-medium text-ink-muted/70 tracking-wide">
              项目
            </div>
            {filtered.projects.map((project) => {
              const keys = filtered.projectMap.get(project.id) ?? [];
              const isExpanded = expandedProjects.has(project.id);
              return (
                <div key={project.id} className="mb-0.5">
                  <div
                    className="group/project flex cursor-pointer items-center gap-0.5 rounded-lg px-2 py-1 transition-colors duration-fast hover:bg-muted"
                    onClick={() => toggleProject(project.id)}
                  >
                    <span className="flex items-center gap-1.5 rounded text-ink-muted">
                      <Folder size={13} />
                    </span>
                    <span className="flex-1 truncate text-[12px] font-medium text-ink">
                      {project.name}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      aria-label={`New session in ${project.name}`}
                      onClick={(e) => { e.stopPropagation(); handleNewInProject(project.id); }}
                      type="button"
                      className="shrink-0 text-ink-muted opacity-0 transition-opacity duration-fast group-hover/project:opacity-100 hover:text-ink"
                    >
                      <Plus size={13} />
                    </Button>
                    <Popover>
                      <PopoverTrigger
                        aria-label="Project menu"
                        className="shrink-0 rounded-md p-0.5 text-ink-muted opacity-0 transition-opacity duration-fast group-hover/project:opacity-100 hover:bg-muted hover:text-ink"
                        onClick={(e) => e.stopPropagation()}
                        render={(props) => (
                          <button {...props} type="button">
                            <MoreHorizontal size={12} />
                          </button>
                        )}
                      />
                      <PopoverContent align="start" sideOffset={4}>
                        <PopoverItem
                          onClick={() => {
                            const newKey = crypto.randomUUID();
                            onAddToProject(project.id, newKey);
                            onSelect(newKey);
                          }}
                        >
                          <Plus size={13} />
                          New session
                        </PopoverItem>
                        <PopoverItem
                          onClick={() => onDeleteProject(project.id)}
                          className="text-red hover:bg-red/10"
                        >
                          <Trash2 size={13} />
                          Delete project
                        </PopoverItem>
                      </PopoverContent>
                    </Popover>
                  </div>

                  {isExpanded && (
                    <div className="ml-3 border-l border-line/20 pl-2.5">
                      {keys.length === 0 ? (
                        <div className="px-2.5 py-2 text-[12px] text-ink-muted">
                          这个项目还没有对话
                        </div>
                      ) : (
                        keys.map((key) => (
                          <SessionItem
                            key={key}
                            sessionKey={key}
                            displayName={getDisplayName(key)}

                            isActive={key === activeKey}
                            isRenaming={renaming === key}
                            renameValue={renameValue}
                            onSelect={onSelect}
                            onRename={startRename}
                            onRenameChange={setRenameValue}
                            onRenameSubmit={submitRename}
                            onRenameCancel={cancelRename}
                            onDelete={onDelete}
                            projects={projects}
                            currentProjectId={project.id}
                            onAddToProject={onAddToProject}
                            onRemoveFromProject={onRemoveFromProject}
                          />
                        ))
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {filtered.orphans.length > 0 && (
          <div>
            <div className="mb-1.5 px-2 text-[11px] font-medium text-ink-muted/70 tracking-wide">
              对话
            </div>
            {filtered.orphans.map((key) => (
              <SessionItem
                key={key}
                sessionKey={key}
                displayName={getDisplayName(key)}
                isActive={key === activeKey}
                isRenaming={renaming === key}
                renameValue={renameValue}
                onSelect={onSelect}
                onRename={startRename}
                onRenameChange={setRenameValue}
                onRenameSubmit={submitRename}
                onRenameCancel={() => {
                  setRenaming(null);
                  setRenameValue("");
                }}
                onDelete={onDelete}
                projects={projects}
                currentProjectId={null}
                onAddToProject={onAddToProject}
                onRemoveFromProject={onRemoveFromProject}
              />
            ))}
          </div>
        )}
      </div>

      {/* Bottom: Settings */}
      <div className="border-t border-line/20 px-2 py-2">
        <button
          className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[13px] font-medium leading-6 text-ink transition-colors duration-fast hover:bg-muted"
          onClick={() => navigate("/settings")}
          type="button"
        >
          <Settings size={16} className="shrink-0 text-ink-secondary" />
          <span>设置</span>
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Session item                                                        */
/* ------------------------------------------------------------------ */

interface SessionItemProps {
  sessionKey: string;
  displayName: string;
  isActive: boolean;
  isRenaming: boolean;
  renameValue: string;
  onSelect(key: string): void;
  onRename(key: string): void;
  onRenameChange(value: string): void;
  onRenameSubmit(key: string): void;
  onRenameCancel(): void;
  onDelete(key: string): Promise<void>;
  projects: Project[];
  currentProjectId: string | null;
  onAddToProject(projectId: string, sessionKey: string): void;
  onRemoveFromProject(projectId: string, sessionKey: string): void;
}

function SessionItem({
  sessionKey,
  displayName,
  isActive,
  isRenaming,
  renameValue,
  onSelect,
  onRename,
  onRenameChange,
  onRenameSubmit,
  onRenameCancel,
  onDelete,
  projects,
  currentProjectId,
  onAddToProject,
  onRemoveFromProject,
}: SessionItemProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const popoverActionsRef = useRef<{ close: () => void; unmount: () => void } | null>(null);

  const isCustomNamed = displayName !== sessionKey;
  const title = isCustomNamed ? displayName : "新对话";

  const handleDelete = async () => {
    popoverActionsRef.current?.close();
    setDeleting(true);
    try {
      await onDelete(sessionKey);
    } catch {
      // Keep visible on error
    } finally {
      setDeleting(false);
    }
  };

  const handleRename = () => {
    popoverActionsRef.current?.close();
    onRename(sessionKey);
  };

  const handleRemoveFromProject = () => {
    popoverActionsRef.current?.close();
    if (currentProjectId) {
      onRemoveFromProject(currentProjectId, sessionKey);
    }
  };

  const otherProjects = useMemo(
    () => projects.filter((p) => p.id !== currentProjectId),
    [projects, currentProjectId]
  );

  return (
    <div
      className={`group/session relative flex items-center gap-0.5 rounded-lg transition-colors duration-fast ${
        isActive
          ? "bg-muted text-ink"
          : "text-ink hover:bg-muted"
      } ${deleting ? "pointer-events-none opacity-40" : ""}`}
    >
      {isRenaming ? (
        <div className="flex min-w-0 flex-1 items-center py-1.5 pl-2.5 pr-2">
          <div className="min-w-0 flex-1">
            <Input
              className="h-7 rounded-md border-line/40 bg-surface px-2 text-[12px] font-medium leading-6 shadow-none focus-visible:ring-1"
              value={renameValue}
              onChange={(e) => onRenameChange(e.target.value)}
              onBlur={() => onRenameSubmit(sessionKey)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  onRenameSubmit(sessionKey);
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  onRenameCancel();
                }
              }}
              type="text"
              autoFocus
            />
          </div>
        </div>
      ) : (
        <button
          className="flex min-w-0 flex-1 items-center overflow-hidden py-1.5 pl-2.5 text-left"
          onClick={() => onSelect(sessionKey)}
          aria-current={isActive ? "page" : undefined}
          type="button"
        >
          <div className="min-w-0 flex-1">
            <div className="truncate text-[12px] font-medium leading-6">
              {title}
            </div>
          </div>
        </button>
      )}

      {!isRenaming && (
        <Popover
          actionsRef={popoverActionsRef}
          onOpenChange={(open) => {
            setMenuOpen(open);
          }}
        >
          <PopoverTrigger
            aria-label="Session menu"
            className={`shrink-0 rounded-md p-1 transition-all duration-fast hover:bg-muted ${
              menuOpen || isActive
                ? "opacity-100"
                : "opacity-0 group-hover/session:opacity-100"
            }`}
            render={(props) => (
              <button {...props} type="button">
                <MoreHorizontal size={13} className="text-ink-muted" />
              </button>
            )}
          />
          <PopoverContent align="start" sideOffset={2}>
            <PopoverItem onClick={handleRename}>
              <Pencil size={13} />
              Rename
            </PopoverItem>
            {otherProjects.length > 0 && (
              <PopoverItem>
                <FolderPlus size={13} />
                <span>Add to project</span>
                <div className="ml-auto flex gap-1">
                  {otherProjects.slice(0, 3).map((p) => (
                    <button
                      key={p.id}
                      className="rounded-md px-1.5 py-0.5 text-[11px] transition-colors duration-fast hover:bg-muted hover:text-ink"
                      onClick={(e) => {
                        e.stopPropagation();
                        popoverActionsRef.current?.close();
                        onAddToProject(p.id, sessionKey);
                      }}
                      type="button"
                      title={p.name}
                    >
                      {p.name.length > 8
                        ? p.name.slice(0, 8) + "…"
                        : p.name}
                    </button>
                  ))}
                  {otherProjects.length > 3 && (
                    <span className="text-[11px] text-ink-muted">
                      +{otherProjects.length - 3}
                    </span>
                  )}
                </div>
              </PopoverItem>
            )}
            {currentProjectId && (
              <PopoverItem onClick={handleRemoveFromProject}>
                <LogOut size={13} />
                Remove from project
              </PopoverItem>
            )}
            <div className="my-1 border-t border-line/20" />
            <PopoverItem
              onClick={handleDelete}
              className="text-red hover:bg-red/10"
            >
              <Trash2 size={13} />
              Delete
            </PopoverItem>
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}
