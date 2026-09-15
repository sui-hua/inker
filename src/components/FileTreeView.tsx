import React, { useState, useEffect, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  Folder,
  FolderOpen,
  ChevronDown,
  FileDiff,
  RefreshCw,
} from "lucide-react";
import { FileIcon } from "./FileIcon";
import { DiffViewer } from "./DiffViewer";

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
  repoPath?: string;
  commitSha?: string;
}

export const FileTreeView: React.FC<FileTreeViewProps> = ({ files, repoPath, commitSha }) => {
  const [collapsedDirs, setCollapsedDirs] = useState<Record<string, boolean>>({});
  const [diffsCache, setDiffsCache] = useState<Record<string, string>>({});
  const [isMaximized, setIsMaximized] = useState(false);
  const [modalDiffFile, setModalDiffFile] = useState<{
    fullPath: string;
    diffText: string;
    additions?: number;
    deletions?: number;
    loading: boolean;
    error?: string;
  } | null>(null);

  // 切换 commit 时清空弹窗
  useEffect(() => {
    setModalDiffFile(null);
    setIsMaximized(false);
  }, [commitSha]);

  // Esc 键关闭独立 Diff 弹窗
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && modalDiffFile) {
        setModalDiffFile(null);
        setIsMaximized(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [modalDiffFile]);

  const toggleCollapse = (dirId: string) => {
    setCollapsedDirs((prev) => ({
      ...prev,
      [dirId]: !prev[dirId],
    }));
  };

  // 点击文件直接唤起专属全屏大窗口对比
  const handleOpenFileDiff = async (node: FileTreeNode) => {
    if (!repoPath || !commitSha) return;

    if (diffsCache[node.fullPath] !== undefined) {
      setModalDiffFile({
        fullPath: node.fullPath,
        diffText: diffsCache[node.fullPath],
        additions: node.additions,
        deletions: node.deletions,
        loading: false,
      });
      return;
    }

    setModalDiffFile({
      fullPath: node.fullPath,
      diffText: "",
      additions: node.additions,
      deletions: node.deletions,
      loading: true,
    });

    try {
      const diff = await invoke<string>("get_file_diff", {
        repoPath,
        sha: commitSha,
        filePath: node.fullPath,
      });
      setDiffsCache((prev) => ({ ...prev, [node.fullPath]: diff }));
      setModalDiffFile((prev) =>
        prev && prev.fullPath === node.fullPath
          ? { ...prev, diffText: diff, loading: false }
          : prev
      );
    } catch (err) {
      setModalDiffFile((prev) =>
        prev && prev.fullPath === node.fullPath
          ? { ...prev, error: String(err), loading: false }
          : prev
      );
    }
  };

  const tree = useMemo(() => buildFileTree(files), [files]);

  const renderNode = (node: FileTreeNode, depth = 0) => {
    const isCollapsed = collapsedDirs[node.id];
    const paddingLeft = depth * 18 + 6;

    if (node.isFolder) {
      return (
        <div key={node.id} className="file-tree-branch">
          <div
            className="file-tree-folder-row"
            style={{ marginLeft: `${paddingLeft}px` }}
            onClick={() => toggleCollapse(node.id)}
            title={node.fullPath}
          >
            <span className="tree-chevron-box">
              <ChevronDown size={12} className={`tree-chevron-icon ${!isCollapsed ? "open" : ""}`} />
            </span>
            <span className="tree-folder-icon">
              {isCollapsed ? <Folder size={14} /> : <FolderOpen size={14} />}
            </span>
            <span className="tree-folder-name">{node.name}</span>

            {/* 改动行数直接放置在文件夹名字后方 */}
            <div className="diff-tags-cluster inline-diff-tags">
              {node.additions > 0 && (
                <span className="diff-watercolor-tag add">+{node.additions}</span>
              )}
              {node.deletions > 0 && (
                <span className="diff-watercolor-tag del">-{node.deletions}</span>
              )}
            </div>
          </div>

          <div className={`tree-children-collapse-wrapper ${!isCollapsed ? "expanded" : "collapsed"}`}>
            <div className="tree-children-collapse-inner">
              <div className="file-tree-children">
                {node.children.map((child) => renderNode(child, depth + 1))}
              </div>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div key={node.id} className="file-tree-item-wrapper">
        <div
          className="file-tree-item-row"
          style={{ marginLeft: `${paddingLeft}px` }}
          onClick={() => handleOpenFileDiff(node)}
          title={`点击在新窗口查看对比: ${node.fullPath}`}
        >
          <span className="tree-chevron-placeholder" />
          <FileIcon filename={node.name} size={16} />
          <span className="tree-file-name">{node.name}</span>

          {/* 改动行数直接放置在文件名后方 */}
          <div className="diff-tags-cluster inline-diff-tags">
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

          {/* 右侧直接唤起独立 Diff 窗口按钮 */}
          <button
            className="tree-row-action-btn file-diff-toggle-btn"
            onClick={(e) => {
              e.stopPropagation();
              handleOpenFileDiff(node);
            }}
            title="在新窗口查看代码对比"
          >
            <FileDiff size={13} />
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="file-tree-container">
      {tree.map((rootNode) => renderNode(rootNode, 0))}

      {modalDiffFile && (
        <div
          className="diff-modal-overlay"
          onClick={() => {
            setModalDiffFile(null);
            setIsMaximized(false);
          }}
        >
          <div
            className={`diff-modal-window ${isMaximized ? "is-maximized" : ""}`}
            onClick={(e) => e.stopPropagation()}
          >
            {modalDiffFile.loading ? (
              <div className="diff-modal-loading-box">
                <RefreshCw size={18} className="spin-icon" />
                <span>正在加载 {modalDiffFile.fullPath} 的代码差异...</span>
              </div>
            ) : modalDiffFile.error ? (
              <div className="diff-modal-error-box">
                <span>加载文件差异失败: {modalDiffFile.error}</span>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => {
                    setModalDiffFile(null);
                    setIsMaximized(false);
                  }}
                >
                  关闭
                </button>
              </div>
            ) : (
              <DiffViewer
                diffText={modalDiffFile.diffText}
                filePath={modalDiffFile.fullPath}
                additions={modalDiffFile.additions}
                deletions={modalDiffFile.deletions}
                isExpandedModal={true}
                isMaximized={isMaximized}
                onToggleMaximize={() => setIsMaximized(!isMaximized)}
                onCloseModal={() => {
                  setModalDiffFile(null);
                  setIsMaximized(false);
                }}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
};
