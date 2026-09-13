import React, { useState } from "react";
import { Folder, FolderOpen, ChevronRight, ChevronDown } from "lucide-react";
import { FileIcon } from "./FileIcon";

export interface ChangedFile {
  name: string;
  file_type: string;
  additions: number;
  deletions: number;
}

export interface FileTreeNode {
  id: string;
  name: string;
  fullPath: string;
  isFolder: boolean;
  children: FileTreeNode[];
  file?: ChangedFile;
  additions: number;
  deletions: number;
}

export function buildFileTree(files: ChangedFile[]): FileTreeNode[] {
  interface TempNode {
    name: string;
    fullPath: string;
    isFolder: boolean;
    children: Map<string, TempNode>;
    file?: ChangedFile;
    additions: number;
    deletions: number;
  }

  const rootChildren = new Map<string, TempNode>();

  for (const f of files) {
    // 彻底剥离可能存在的首尾双引号及八进制转义残留
    const cleanPath = f.name.trim().replace(/^"+|"+$/g, "");
    const parts = cleanPath
      .split("/")
      .map((p) => p.trim().replace(/^"+|"+$/g, ""))
      .filter(Boolean);
    let currentMap = rootChildren;
    let currentPath = "";

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      const isFile = i === parts.length - 1;

      if (!currentMap.has(part)) {
        currentMap.set(part, {
          name: part,
          fullPath: currentPath,
          isFolder: !isFile,
          children: new Map(),
          file: isFile ? f : undefined,
          additions: 0,
          deletions: 0,
        });
      }

      const node = currentMap.get(part)!;
      node.additions += f.additions;
      node.deletions += f.deletions;

      if (!isFile) {
        currentMap = node.children;
      }
    }
  }

  function convertAndCompact(map: Map<string, TempNode>): FileTreeNode[] {
    const result: FileTreeNode[] = [];

    for (const [, temp] of map) {
      if (temp.isFolder) {
        let current = temp;
        let combinedName = current.name;
        // 自动压缩单子文件夹链路 (例如 Iris/src/renderer/src/components/auth)
        while (current.children.size === 1) {
          const onlyChild = current.children.values().next().value as TempNode;
          if (onlyChild.isFolder) {
            combinedName += `/${onlyChild.name}`;
            current = onlyChild;
          } else {
            break;
          }
        }

        result.push({
          id: current.fullPath,
          name: combinedName,
          fullPath: current.fullPath,
          isFolder: true,
          children: convertAndCompact(current.children),
          additions: temp.additions,
          deletions: temp.deletions,
        });
      } else {
        result.push({
          id: temp.fullPath,
          name: temp.name,
          fullPath: temp.fullPath,
          isFolder: false,
          children: [],
          file: temp.file,
          additions: temp.additions,
          deletions: temp.deletions,
        });
      }
    }

    result.sort((a, b) => {
      if (a.isFolder === b.isFolder) return a.name.localeCompare(b.name);
      return a.isFolder ? -1 : 1;
    });

    return result;
  }

  return convertAndCompact(rootChildren);
}

interface FileTreeViewProps {
  files: ChangedFile[];
}

export const FileTreeView: React.FC<FileTreeViewProps> = ({ files }) => {
  const [collapsedDirs, setCollapsedDirs] = useState<Record<string, boolean>>({});

  const toggleCollapse = (dirId: string) => {
    setCollapsedDirs((prev) => ({
      ...prev,
      [dirId]: !prev[dirId],
    }));
  };

  const tree = React.useMemo(() => buildFileTree(files), [files]);

  const renderNode = (node: FileTreeNode, depth = 0) => {
    const isCollapsed = collapsedDirs[node.id];
    const paddingLeft = depth * 18 + 6;

    if (node.isFolder) {
      return (
        <div key={node.id} className="file-tree-branch">
          <div
            className="file-tree-folder-row"
            style={{ paddingLeft: `${paddingLeft}px` }}
            onClick={() => toggleCollapse(node.id)}
            title={node.fullPath}
          >
            <span className="tree-chevron-box">
              {isCollapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
            </span>
            <span className="tree-folder-icon">
              {isCollapsed ? <Folder size={14} /> : <FolderOpen size={14} />}
            </span>
            <span className="tree-folder-name">{node.name}</span>
            <div className="diff-tags-cluster" style={{ marginLeft: "auto" }}>
              {node.additions > 0 && (
                <span className="diff-watercolor-tag add">+{node.additions}</span>
              )}
              {node.deletions > 0 && (
                <span className="diff-watercolor-tag del">-{node.deletions}</span>
              )}
            </div>
          </div>

          {!isCollapsed && (
            <div className="file-tree-children">
              {node.children.map((child) => renderNode(child, depth + 1))}
            </div>
          )}
        </div>
      );
    }

    return (
      <div
        key={node.id}
        className="file-tree-item-row"
        style={{ paddingLeft: `${paddingLeft}px` }}
        title={node.fullPath}
      >
        <span className="tree-chevron-placeholder" />
        <FileIcon filename={node.name} size={16} />
        <span className="tree-file-name">{node.name}</span>
        <div className="diff-tags-cluster" style={{ marginLeft: "auto" }}>
          {node.additions > 0 && (
            <span className="diff-watercolor-tag add">+{node.additions}</span>
          )}
          {node.deletions > 0 && (
            <span className="diff-watercolor-tag del">-{node.deletions}</span>
          )}
          {node.additions === 0 && node.deletions === 0 && (
            <span
              className="diff-watercolor-tag"
              style={{
                backgroundColor: "var(--chip-bg)",
                color: "var(--ink-tertiary)",
                border: "1px solid var(--hairline)",
              }}
            >
              0
            </span>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="file-tree-container">
      {tree.map((rootNode) => renderNode(rootNode, 0))}
    </div>
  );
};
