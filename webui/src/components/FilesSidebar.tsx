import { useState } from "react";
import { ChevronDown, ChevronRight, File, Folder, RefreshCw } from "lucide-react";

import type { FileTreeNode } from "../api/types";
import { Button } from "./ui/button";

type Tab = "files" | "changes";

interface FilesSidebarProps {
  tree?: FileTreeNode;
  selectedPath?: string;
  selectedContent?: string;
  workspacePath?: string;
  error?: string;
  onSelect(path: string): void;
  onRefresh(): void;
  onToggleCollapse?(): void;
}

export default function FilesSidebar({
  tree,
  selectedPath,
  selectedContent,
  workspacePath,
  error,
  onSelect,
  onRefresh
}: FilesSidebarProps) {
  const [tab, setTab] = useState<Tab>("files");

  return (
    <div className="flex h-full min-h-0 flex-col bg-sidebar">
      {/* Tab bar */}
      <div className="flex shrink-0 items-center border-b border-line/20">
        <button
          className={`flex-1 py-2.5 text-center text-[12px] font-medium transition-colors duration-fast ${
            tab === "files"
              ? "border-b-[1.5px] border-accent text-accent"
              : "text-ink-muted hover:text-ink"
          }`}
          onClick={() => setTab("files")}
          type="button"
        >
          Files
        </button>
        <button
          className={`flex-1 py-2.5 text-center text-[12px] font-medium transition-colors duration-fast ${
            tab === "changes"
              ? "border-b-[1.5px] border-accent text-accent"
              : "text-ink-muted hover:text-ink"
          }`}
          onClick={() => setTab("changes")}
          type="button"
        >
          Changes
        </button>
      </div>

      {tab === "files" ? (
        <FilesTab
          tree={tree}
          selectedPath={selectedPath}
          selectedContent={selectedContent}
          workspacePath={workspacePath}
          error={error}
          onSelect={onSelect}
          onRefresh={onRefresh}
        />
      ) : (
        <ChangesTab />
      )}
    </div>
  );
}

function FilesTab({
  tree,
  selectedPath,
  selectedContent,
  workspacePath,
  error,
  onSelect,
  onRefresh
}: FilesSidebarProps) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Workspace path */}
      <div className="flex items-center gap-1.5 px-3 py-2">
        <span
          className="min-w-0 flex-1 truncate font-mono text-[11px] text-ink-muted"
          title={workspacePath ?? tree?.path ?? "."}
        >
          {workspacePath ?? tree?.path ?? "."}
        </span>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label="Refresh files"
          onClick={onRefresh}
          type="button"
          className="text-ink-muted hover:text-ink"
        >
          <RefreshCw size={13} />
        </Button>
      </div>

      {/* File tree */}
      <div className="min-h-0 flex-1 overflow-y-auto px-2">
        {tree?.children?.map((node) => (
          <FileTreeRow
            key={node.path}
            node={node}
            selectedPath={selectedPath}
            depth={0}
            onSelect={onSelect}
          />
        ))}
        {!tree?.children?.length && (
          <div className="mt-8 text-center text-[12px] text-ink-muted">
            No files
          </div>
        )}
      </div>

      {error ? (
        <div className="mx-2.5 mb-2 rounded-lg bg-red-soft px-3 py-2 text-[12px] leading-relaxed text-red">
          {error}
        </div>
      ) : null}

      {/* File preview */}
      {selectedPath ? (
        <div className="mx-2 mb-3 shrink-0 rounded-xl bg-surface p-3 shadow-[inset_0_0_0_1px_var(--border-light)]">
          <div className="mb-1.5 truncate font-mono text-[11px] font-medium text-ink">
            {selectedPath}
          </div>
          <pre className="max-h-48 overflow-y-auto whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-ink-muted">
            {selectedContent?.slice(0, 1200) ?? "Loading..."}
          </pre>
        </div>
      ) : null}
    </div>
  );
}

function ChangesTab() {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center px-4">
      <div className="text-center">
        <p className="text-[13px] text-ink-muted">Changes will appear here</p>
        <p className="mt-1 text-[12px] text-ink-muted/70">
          Diff view for workspace modifications is coming soon.
        </p>
      </div>
    </div>
  );
}

/* ---- File tree row ---- */

interface FileTreeRowProps {
  node: FileTreeNode;
  selectedPath?: string;
  depth: number;
  onSelect(path: string): void;
}

function FileTreeRow({ node, selectedPath, depth, onSelect }: FileTreeRowProps) {
  const [expanded, setExpanded] = useState(false);
  const isFile = node.type === "file";
  const isSelected = node.path === selectedPath;
  const hasChildren = Boolean(node.children?.length);

  const content = (
    <>
      <span className="grid h-4 w-4 place-items-center shrink-0">
        {isFile ? (
          <File size={13} className="text-ink-muted" />
        ) : (
          <Folder size={13} className="text-ink-muted" />
        )}
      </span>
      <span className="truncate">{node.path}</span>
    </>
  );

  return (
    <div>
      {isFile ? (
        <button
          className={`grid min-h-[28px] w-full grid-cols-[18px_minmax(0,1fr)] items-center gap-2 rounded-lg px-2 text-left font-mono text-[12px] transition-colors duration-fast ${
            isSelected
              ? "bg-muted text-ink"
              : "text-ink-secondary hover:bg-muted"
          }`}
          style={{ paddingLeft: `${8 + depth * 12}px` }}
          aria-current={isSelected ? "page" : undefined}
          onClick={() => onSelect(node.path)}
          type="button"
        >
          {content}
        </button>
      ) : (
        <button
          className="grid min-h-[28px] w-full grid-cols-[16px_18px_minmax(0,1fr)] items-center gap-1 rounded-lg px-2 text-left font-mono text-[12px] text-ink-secondary transition-colors duration-fast hover:bg-muted"
          style={{ paddingLeft: `${8 + depth * 12}px` }}
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded((current) => !current)}
        >
          <span className="grid h-4 w-4 place-items-center">
            {hasChildren && expanded ? (
              <ChevronDown size={12} className="text-ink-muted" />
            ) : (
              <ChevronRight size={12} className="text-ink-muted" />
            )}
          </span>
          {content}
        </button>
      )}
      {expanded
        ? node.children?.map((child) => (
            <FileTreeRow
              key={child.path}
              node={child}
              selectedPath={selectedPath}
              depth={depth + 1}
              onSelect={onSelect}
            />
          ))
        : null}
    </div>
  );
}
