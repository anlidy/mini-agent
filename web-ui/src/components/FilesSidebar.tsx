import { RefreshCw } from "lucide-react";

import type { FileTreeNode } from "../api/types";

interface FilesSidebarProps {
  tree?: FileTreeNode;
  selectedPath?: string;
  selectedContent?: string;
  error?: string;
  onSelect(path: string): void;
  onRefresh(): void;
}

export default function FilesSidebar({
  tree,
  selectedPath,
  selectedContent,
  error,
  onSelect,
  onRefresh
}: FilesSidebarProps) {
  return (
    <div>
      <div className="flex h-12 items-center justify-between px-3 text-xs font-bold uppercase text-muted">
        <span>Files</span>
        <button
          className="grid h-[30px] w-[30px] place-items-center rounded-[7px] border border-line bg-white text-text"
          onClick={onRefresh}
          type="button"
          aria-label="Refresh files"
        >
          <RefreshCw size={14} />
        </button>
      </div>
      <div className="mx-3 mb-2.5 rounded-[7px] bg-white px-2.5 py-2 text-[13px] text-[#9aa2aa] shadow-[inset_0_0_0_1px_#e1e5e2]">
        Filter files
      </div>
      <div className="px-2.5">
        {tree?.children?.map((node) => (
          <FileTreeRow key={node.path} node={node} selectedPath={selectedPath} depth={0} onSelect={onSelect} />
        ))}
      </div>
      {error ? <div className="mx-2.5 mt-3 rounded-ui bg-red/10 p-2.5 text-xs text-red">{error}</div> : null}
      {selectedPath ? (
        <div className="mx-2.5 mt-3 rounded-ui bg-white p-2.5 shadow-[inset_0_0_0_1px_#e1e5e2]">
          <strong className="mb-2 block truncate font-mono text-[11px] text-ink">{selectedPath}</strong>
          <pre className="max-h-64 overflow-hidden whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-muted">
            {selectedContent?.slice(0, 1200) ?? "Loading..."}
          </pre>
        </div>
      ) : null}
    </div>
  );
}

interface FileTreeRowProps {
  node: FileTreeNode;
  selectedPath?: string;
  depth: number;
  onSelect(path: string): void;
}

function FileTreeRow({ node, selectedPath, depth, onSelect }: FileTreeRowProps) {
  const isFile = node.type === "file";
  const isSelected = node.path === selectedPath;
  const content = (
    <>
      <span>{isFile ? "f" : "d"}</span>
      <span className="truncate">{node.path}</span>
    </>
  );

  return (
    <div>
      {isFile ? (
        <button
          className={`grid min-h-7 w-full grid-cols-[18px_minmax(0,1fr)] items-center gap-2 rounded-[7px] px-2 text-left font-mono text-xs ${
            isSelected ? "bg-white text-text shadow-[inset_0_0_0_1px_#e1e5e2]" : "text-muted"
          }`}
          style={{ paddingLeft: `${8 + depth * 12}px` }}
          aria-current={isSelected ? "page" : undefined}
          onClick={() => onSelect(node.path)}
          type="button"
        >
          {content}
        </button>
      ) : (
        <div
          className="grid min-h-7 grid-cols-[18px_minmax(0,1fr)] items-center gap-2 rounded-[7px] px-2 font-mono text-xs text-muted"
          style={{ paddingLeft: `${8 + depth * 12}px` }}
        >
          {content}
        </div>
      )}
      {node.children?.map((child) => (
        <FileTreeRow key={child.path} node={child} selectedPath={selectedPath} depth={depth + 1} onSelect={onSelect} />
      ))}
    </div>
  );
}
