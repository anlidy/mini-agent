import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Brain,
  Folder,
  Menu,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Settings,
  SquarePen,
  Trash2,
  FolderPlus,
  LogOut,
  X,
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
}: SessionSidebarProps) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(
    () => new Set(projects.map((p) => p.id))
  );
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  // Build a session lookup map for quick access
  const sessionMap = useMemo(() => {
    const map = new Map<string, SessionSummary>();
    for (const s of sessions) {
      map.set(s.key, s);
    }
    return map;
  }, [sessions]);

  // Filter based on search query
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return { projects, projectMap, orphans };

    const filteredProjectMap = new Map<string, string[]>();
    for (const [projectId, keys] of projectMap) {
      const project = projects.find((p) => p.id === projectId);
      const projectMatch = project?.name.toLowerCase().includes(q);
      const matchingKeys = keys.filter((k) => {
        const name = getDisplayName(k).toLowerCase();
        const preview = sessionMap.get(k)?.preview?.toLowerCase() ?? "";
        return projectMatch || name.includes(q) || preview.includes(q);
      });
      if (matchingKeys.length > 0 || projectMatch) {
        filteredProjectMap.set(projectId, matchingKeys.length > 0 ? matchingKeys : keys);
      }
    }

    const filteredOrphans = orphans.filter((k) => {
      const name = getDisplayName(k).toLowerCase();
      const preview = sessionMap.get(k)?.preview?.toLowerCase() ?? "";
      return name.includes(q) || preview.includes(q);
    });

    return { projects, projectMap: filteredProjectMap, orphans: filteredOrphans };
  }, [query, projects, projectMap, orphans, getDisplayName, sessionMap]);

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

  const handleNewInProject = (projectId: string) => {
    const newKey = `session-${crypto.randomUUID()}`;
    onAddToProject(projectId, newKey);
    onSelect(newKey);
  };

  const sessionKeys = useMemo(
    () => sessions.map((s) => s.key),
    [sessions]
  );

  const getPreview = (key: string) => {
    return sessionMap.get(key)?.preview ?? "";
  };

  return (
    <div className="flex h-full flex-col border-r border-line bg-sidebar">
      {/* ===== Header ===== */}
      <div className="flex h-14 items-center justify-between px-4">
        <span className="text-[15px] font-semibold tracking-tight text-sidebar-foreground">
          Agent
        </span>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Search sessions"
            onClick={() => {
              setShowSearch(!showSearch);
              if (showSearch) setQuery("");
            }}
            type="button"
            className="text-[#777]"
          >
            {showSearch ? <X size={17} /> : <Search size={17} />}
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Collapse panel"
            onClick={onToggleCollapse}
            type="button"
            className="text-[#777]"
          >
            <Menu size={18} />
          </Button>
        </div>
      </div>

      {/* ===== Search bar (conditional) ===== */}
      {showSearch && (
        <div className="px-3 pb-2">
          <div className="flex items-center gap-1.5 rounded-xl border border-line bg-white px-3 py-2 transition-shadow focus-within:ring-2 focus-within:ring-ring/20">
            <Search size={15} className="shrink-0 text-muted-foreground" />
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

      {/* ===== Actions area ===== */}
      <div className="px-3 pb-3">
        <div className="space-y-0.5">
          <button
            className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1 text-[13px] font-medium leading-6 text-sidebar-foreground transition-colors hover:bg-muted/80"
            onClick={onNew}
            type="button"
          >
            <SquarePen size={16} strokeWidth={2} className="shrink-0 text-[#3f3f3f]" />
            <span>新建对话</span>
          </button>
          <button
            className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1 text-[13px] font-medium leading-6 text-sidebar-foreground transition-colors hover:bg-muted/80"
            type="button"
          >
            <Brain size={16} className="shrink-0 text-[#3f3f3f]" />
            <span>技能</span>
          </button>
        </div>
      </div>

      {/* ===== Divider ===== */}
      <div className="mx-4 border-t border-transparent" />

      {/* ===== History area (scrollable) ===== */}
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
        {/* No results */}
        {filtered.projects.length === 0 && filtered.orphans.length === 0 && (
          <div className="mt-8 text-center text-[12px] text-muted-foreground">
            {query.trim() ? "没有匹配的对话" : "暂无对话"}
          </div>
        )}

        {/* ===== Projects section ===== */}
        {filtered.projects.length > 0 && (
          <div className="mb-3">
            <div className="mb-2 px-1 text-[11px] font-medium text-[#b1b1b1]">
              项目
            </div>
            {filtered.projects.map((project) => {
              const keys = filtered.projectMap.get(project.id) ?? [];
              const isExpanded = expandedProjects.has(project.id);
              return (
                <div key={project.id} className="mb-0.5">
                  {/* Project header row — entire row clickable to expand */}
                  <div
                    className="group/project flex cursor-pointer items-center gap-0.5 rounded-lg px-1.5 py-1 hover:bg-muted/70"
                    onClick={() => toggleProject(project.id)}
                  >
                    <span className="flex items-center gap-1.5 rounded p-0.5 text-muted-foreground">
                      <Folder size={13} />
                    </span>
                    <span className="flex-1 truncate text-[12px] font-medium text-sidebar-foreground">
                      {project.name}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      aria-label={`New session in ${project.name}`}
                      onClick={(e) => { e.stopPropagation(); handleNewInProject(project.id); }}
                      type="button"
                      className="shrink-0 opacity-0 transition-opacity group-hover/project:opacity-100"
                    >
                      <Plus size={13} />
                    </Button>
                    <Popover>
                      <PopoverTrigger
                        render={(props) => (
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            aria-label="Project menu"
                            type="button"
                            className="shrink-0 opacity-0 transition-opacity group-hover/project:opacity-100"
                            onClick={(e) => e.stopPropagation()}
                            {...props}
                          />
                        )}
                      >
                        <MoreHorizontal size={12} />
                      </PopoverTrigger>
                      <PopoverContent align="start" sideOffset={4}>
                        <PopoverItem
                          onClick={() => {
                            const newKey = `session-${crypto.randomUUID()}`;
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

                  {/* Project sessions */}
                  {isExpanded && (
                    <div className="ml-3 border-l border-line/70 pl-2">
                      {keys.length === 0 ? (
                        <div className="px-2.5 py-2 text-[13px] text-muted-foreground">
                          这个项目还没有对话
                        </div>
                      ) : (
                        keys.map((key) => (
                          <SessionItem
                            key={key}
                            sessionKey={key}
                            displayName={getDisplayName(key)}
                            preview={getPreview(key)}
                            isActive={key === activeKey}
                            onSelect={onSelect}
                            onRename={startRename}
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

        {/* ===== Conversations section (orphans) ===== */}
        {filtered.orphans.length > 0 && (
          <div>
            <div className="mb-2 px-1 text-[11px] font-medium text-[#b1b1b1]">
              对话
            </div>
            {filtered.orphans.map((key) => (
              <SessionItem
                key={key}
                sessionKey={key}
                displayName={getDisplayName(key)}
                preview={getPreview(key)}
                isActive={key === activeKey}
                onSelect={onSelect}
                onRename={startRename}
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

      {/* ===== Bottom: Settings ===== */}
      <div className="border-t border-line/70 px-4 py-3">
        <button
          className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1 text-[13px] font-medium leading-6 text-sidebar-foreground transition-colors hover:bg-muted/80"
          onClick={() => navigate("/settings")}
          type="button"
        >
          <Settings size={16} className="shrink-0 text-[#3f3f3f]" />
          <span>设置</span>
        </button>
      </div>

      {/* ===== Rename inline dialog (rendered at root) ===== */}
      {renaming && (
        <RenameDialog
          value={renameValue}
          onChange={setRenameValue}
          onSubmit={() => submitRename(renaming!)}
          onCancel={() => {
            setRenaming(null);
            setRenameValue("");
          }}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Session item component                                             */
/* ------------------------------------------------------------------ */

interface SessionItemProps {
  sessionKey: string;
  displayName: string;
  preview: string;
  isActive: boolean;
  onSelect(key: string): void;
  onRename(key: string): void;
  onDelete(key: string): Promise<void>;
  projects: Project[];
  currentProjectId: string | null;
  onAddToProject(projectId: string, sessionKey: string): void;
  onRemoveFromProject(projectId: string, sessionKey: string): void;
}

function SessionItem({
  sessionKey,
  displayName,
  preview,
  isActive,
  onSelect,
  onRename,
  onDelete,
  projects,
  currentProjectId,
  onAddToProject,
  onRemoveFromProject,
}: SessionItemProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await onDelete(sessionKey);
    } catch {
      // Keep item visible on error
    } finally {
      setDeleting(false);
    }
  };

  // Other projects (not the current one) for "Add to project" submenu
  const otherProjects = projects.filter((p) => p.id !== currentProjectId);

  return (
    <div
      className={`group/session relative flex items-center gap-1 rounded-lg transition-colors ${
        isActive
          ? "bg-white text-foreground shadow-[inset_0_0_0_1px_#eeeeee]"
          : "text-[#2f2f2f] hover:bg-muted/70"
      } ${deleting ? "pointer-events-none opacity-50" : ""}`}
    >
      {/* Clickable area for selecting session */}
      <button
        className="flex min-w-0 flex-1 items-center overflow-hidden py-1.5 pl-2.5 text-left"
        onClick={() => onSelect(sessionKey)}
        aria-current={isActive ? "page" : undefined}
        type="button"
      >
        <div className="min-w-0 flex-1">
          <div className="truncate text-[12px] font-medium leading-6">
            {displayName}
          </div>
          {preview && (
            <div className="truncate text-[12px] leading-relaxed text-muted-foreground">
              {preview}
            </div>
          )}
        </div>
      </button>

      {/* Three-dot menu button — visible on row hover */}
      <Popover
        onOpenChange={(open) => {
          // Sync internal state for hover styling
          setMenuOpen(open);
        }}
      >
        <PopoverTrigger
          render={(props) => (
            <button
              className={`shrink-0 rounded-md p-1 transition-all hover:bg-muted ${
                menuOpen || isActive
                  ? "opacity-100"
                  : "opacity-0 group-hover/session:opacity-100"
              }`}
              aria-label="Session menu"
              type="button"
              {...props}
            />
          )}
        >
          <MoreHorizontal size={13} />
        </PopoverTrigger>
        <PopoverContent align="start" sideOffset={2}>
          <PopoverItem onClick={() => onRename(sessionKey)}>
            <Pencil size={13} />
            Rename
          </PopoverItem>
          {otherProjects.length > 0 && (
            <PopoverItem>
              <FolderPlus size={13} />
              <span>Add to project</span>
              {/* Submenu-like: list projects inline */}
              <div className="ml-auto flex gap-1">
                {otherProjects.slice(0, 3).map((p) => (
                  <button
                    key={p.id}
                    className="rounded px-1.5 py-0.5 text-[11px] hover:bg-accent hover:text-accent-foreground"
                    onClick={(e) => {
                      e.stopPropagation();
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
                  <span className="text-[11px] text-muted-foreground">
                    +{otherProjects.length - 3}
                  </span>
                )}
              </div>
            </PopoverItem>
          )}
          {currentProjectId && (
            <PopoverItem
              onClick={() => onRemoveFromProject(currentProjectId, sessionKey)}
            >
              <LogOut size={13} />
              Remove from project
            </PopoverItem>
          )}
          <div className="my-1 border-t border-line/40" />
          <PopoverItem
            onClick={handleDelete}
            className="text-red hover:bg-red/10"
          >
            <Trash2 size={13} />
            Delete
          </PopoverItem>
        </PopoverContent>
      </Popover>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Inline rename dialog                                                */
/* ------------------------------------------------------------------ */

interface RenameDialogProps {
  value: string;
  onChange(value: string): void;
  onSubmit(): void;
  onCancel(): void;
}

function RenameDialog({ value, onChange, onSubmit, onCancel }: RenameDialogProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/10">
      <div
        className="w-64 rounded-xl bg-popover p-3 shadow-lg ring-1 ring-foreground/10"
        onClick={(e) => e.stopPropagation()}
      >
        <Input
          className="mb-2 w-full text-[13px]"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onSubmit();
            if (e.key === "Escape") onCancel();
          }}
          placeholder="Session name..."
          type="text"
          autoFocus
        />
        <div className="flex justify-end gap-1.5">
          <Button variant="ghost" size="xs" onClick={onCancel} type="button">
            Cancel
          </Button>
          <Button
            variant="default"
            size="xs"
            onClick={onSubmit}
            disabled={!value.trim()}
            type="button"
          >
            Save
          </Button>
        </div>
      </div>
    </div>
  );
}
