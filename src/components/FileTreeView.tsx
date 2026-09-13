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

interface DiffLine {
  type: "meta" | "hunk" | "add" | "del" | "normal" | "info";
  oldLineNumber?: number | null;
  newLineNumber?: number | null;
  content: string;
}

function parseGitDiff(diffText: string): DiffLine[] {
  if (!diffText || !diffText.trim()) return [];
  const lines = diffText.split("\n");
  const result: DiffLine[] = [];
  let oldLine = 0;
  let newLine = 0;
  let hunkCount = 0;

  for (const line of lines) {
    // 过滤掉所有底层 Git patch 协议头 (diff --git, index, ---, +++, mode 等元信息)
    if (
      line.startsWith("diff --git") ||
      line.startsWith("index ") ||
      line.startsWith("--- ") ||
      line.startsWith("+++ ") ||
      line.startsWith("new file mode") ||
      line.startsWith("deleted file mode") ||
      line.startsWith("old mode") ||
      line.startsWith("new mode") ||
      line.startsWith("similarity index") ||
      line.startsWith("rename from") ||
      line.startsWith("rename to")
    ) {
      continue;
    }

    if (line.startsWith("@@")) {
      const match = line.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)/);
      if (match) {
        oldLine = parseInt(match[1], 10);
        newLine = parseInt(match[3], 10);
      }
      hunkCount++;
      // 若非首个 hunk 或不是从第一行开始的变更，展示分段跳转提示
      if (hunkCount > 1 || oldLine > 1 || newLine > 1) {
        result.push({
          type: "hunk",
          content: line.trim(),
        });
      }
    } else if (line.startsWith("+") && !line.startsWith("+++")) {
      result.push({
        type: "add",
        newLineNumber: newLine,
        content: line.slice(1),
      });
      newLine++;
    } else if (line.startsWith("-") && !line.startsWith("---")) {
      result.push({
        type: "del",
        oldLineNumber: oldLine,
        content: line.slice(1),
      });
      oldLine++;
    } else if (line.startsWith(" ")) {
      result.push({
        type: "normal",
        oldLineNumber: oldLine,
        newLineNumber: newLine,
        content: line.slice(1),
      });
      oldLine++;
      newLine++;
    } else if (line.startsWith("\\")) {
      result.push({
        type: "info",
        content: line,
      });
    }
  }

  return result;
}

interface DiffViewerProps {
  diffText: string;
  filename?: string;
}

const DiffViewer: React.FC<DiffViewerProps> = ({ diffText }) => {
  const parsedLines = useMemo(() => parseGitDiff(diffText), [diffText]);

  // 计算行号最大值及所需位数，动态自适应宽度，避免个位数时产生奇怪空白
  const maxLine = useMemo(() => {
    let m = 0;
    for (const l of parsedLines) {
      if (l.oldLineNumber && l.oldLineNumber > m) m = l.oldLineNumber;
      if (l.newLineNumber && l.newLineNumber > m) m = l.newLineNumber;
    }
    return m;
  }, [parsedLines]);

  const digits = Math.max(1, maxLine > 0 ? String(maxLine).length : 1);
  // 单数字时只需约 18px (留 5px 内边距)，个位数紧凑不空旷，多位数自动扩展
  const gutterWidth = Math.max(18, digits * 7 + 10);

  if (!diffText.trim() || parsedLines.length === 0) {
    return (
      <div className="file-diff-card empty-card" onClick={(e) => e.stopPropagation()}>
        <span className="diff-empty-hint">此文件无文本差异或为二进制文件</span>
      </div>
    );
  }

  return (
    <div className="file-diff-card" onClick={(e) => e.stopPropagation()}>
      <div className="diff-lines-scroller">
        <div className="diff-lines-table">
          {parsedLines.map((line, idx) => {
            if (line.type === "meta") {
              return (
                <div key={idx} className="diff-row diff-meta-row">
                  <div className="diff-col-gutter" style={{ width: `${gutterWidth}px` }} />
                  <div className="diff-col-sign" />
                  <div className="diff-col-code meta-text">{line.content}</div>
                </div>
              );
            }
            if (line.type === "hunk") {
              return (
                <div key={idx} className="diff-row diff-hunk-row">
                  <div className="diff-col-gutter" style={{ width: `${gutterWidth}px` }}>...</div>
                  <div className="diff-col-sign">@</div>
                  <div className="diff-col-code hunk-text">{line.content}</div>
                </div>
              );
            }
            if (line.type === "info") {
              return (
                <div key={idx} className="diff-row diff-info-row">
                  <div className="diff-col-gutter" style={{ width: `${gutterWidth}px` }} />
                  <div className="diff-col-sign">~</div>
                  <div className="diff-col-code info-text">{line.content}</div>
                </div>
              );
            }

            const lineNum =
              line.type === "del"
                ? line.oldLineNumber
                : line.newLineNumber != null
                ? line.newLineNumber
                : line.oldLineNumber;

            return (
              <div key={idx} className={`diff-row diff-${line.type}-row`}>
                <div className="diff-col-gutter" style={{ width: `${gutterWidth}px` }}>
                  {lineNum != null ? lineNum : ""}
                </div>
                <div className="diff-col-sign">
                  {line.type === "add" ? "+" : line.type === "del" ? "-" : " "}
                </div>
                <div className="diff-col-code">{line.content}</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

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
  const [expandedDiffs, setExpandedDiffs] = useState<Record<string, boolean>>({});
  const [diffsCache, setDiffsCache] = useState<Record<string, string>>({});
  const [loadingDiffs, setLoadingDiffs] = useState<Record<string, boolean>>({});
  const [diffErrors, setDiffErrors] = useState<Record<string, string>>({});

  // 切换 commit 时，清空已展开的 diff
  useEffect(() => {
    setExpandedDiffs({});
  }, [commitSha]);

  const toggleCollapse = (dirId: string) => {
    setCollapsedDirs((prev) => ({
      ...prev,
      [dirId]: !prev[dirId],
    }));
  };

  const toggleDiff = async (node: FileTreeNode) => {
    const nextState = !expandedDiffs[node.id];
    setExpandedDiffs((prev) => ({
      ...prev,
      [node.id]: nextState,
    }));

    if (nextState && !diffsCache[node.fullPath] && repoPath && commitSha) {
      setLoadingDiffs((prev) => ({ ...prev, [node.fullPath]: true }));
      setDiffErrors((prev) => ({ ...prev, [node.fullPath]: "" }));
      try {
        const diff = await invoke<string>("get_file_diff", {
          repoPath,
          sha: commitSha,
          filePath: node.fullPath,
        });
        setDiffsCache((prev) => ({ ...prev, [node.fullPath]: diff }));
      } catch (err) {
        setDiffErrors((prev) => ({ ...prev, [node.fullPath]: String(err) }));
      } finally {
        setLoadingDiffs((prev) => ({ ...prev, [node.fullPath]: false }));
      }
    }
  };

  const tree = useMemo(() => buildFileTree(files), [files]);

  const renderNode = (node: FileTreeNode, depth = 0) => {
    const isCollapsed = collapsedDirs[node.id];
    const isDiffOpen = expandedDiffs[node.id];
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
          className={`file-tree-item-row ${isDiffOpen ? "diff-expanded" : ""}`}
          style={{ marginLeft: `${paddingLeft}px` }}
          onClick={() => toggleDiff(node)}
          title={node.fullPath}
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

          {/* 右侧末尾开闭按钮 (文件则切换展示 Diff) */}
          <button
            className={`tree-row-action-btn file-diff-toggle-btn ${isDiffOpen ? "active" : ""}`}
            onClick={(e) => {
              e.stopPropagation();
              toggleDiff(node);
            }}
            title={isDiffOpen ? "收起代码差异" : "查看代码差异"}
          >
            <FileDiff size={13} />
            <ChevronDown size={11} className={`file-diff-chevron-icon ${isDiffOpen ? "open" : ""}`} />
          </button>
        </div>

        {/* 展开展示 Diff 对比视图 (平滑折叠动画) */}
        <div className={`file-diff-collapse-wrapper ${isDiffOpen ? "expanded" : "collapsed"}`}>
          <div className="file-diff-collapse-inner">
            <div
              className="file-diff-block-wrapper"
              style={{ marginLeft: `${paddingLeft}px` }}
            >
              {loadingDiffs[node.fullPath] ? (
                <div className="file-diff-card empty-card">
                  <div className="file-diff-loading">
                    <RefreshCw size={13} className="spin-icon" />
                    <span>正在加载 {node.name} 的变更对比...</span>
                  </div>
                </div>
              ) : diffErrors[node.fullPath] ? (
                <div className="file-diff-card empty-card">
                  <div className="file-diff-error">
                    加载差异失败: {diffErrors[node.fullPath]}
                  </div>
                </div>
              ) : (
                <DiffViewer
                  diffText={diffsCache[node.fullPath] || ""}
                  filename={node.fullPath}
                />
              )}
            </div>
          </div>
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
