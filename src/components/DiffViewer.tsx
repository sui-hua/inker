import React, { useState, useMemo } from "react";
import {
  Columns2,
  Rows3,
  Maximize2,
  Minimize2,
  Copy,
  Check,
  X,
} from "lucide-react";
import { FileIcon } from "./FileIcon";

export interface DiffLine {
  type: "meta" | "add" | "del" | "normal" | "info";
  oldLineNumber?: number | null;
  newLineNumber?: number | null;
  content: string;
}

export interface SplitRow {
  type: "diff";
  left?: {
    type: "del" | "normal";
    lineNumber: number;
    content: string;
  } | null;
  right?: {
    type: "add" | "normal";
    lineNumber: number;
    content: string;
  } | null;
}

export function parseGitDiff(diffText: string): DiffLine[] {
  if (!diffText || !diffText.trim()) return [];
  const lines = diffText.split("\n");
  const result: DiffLine[] = [];
  let oldLine = 0;
  let newLine = 0;
  let hunkCount = 0;

  for (const line of lines) {
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
      // 不将 @@ hunk 行推入渲染列表，直接跳过不显示
      continue;
    }

    if (line.startsWith("+")) {
      result.push({
        type: "add",
        newLineNumber: newLine,
        content: line.slice(1),
      });
      newLine++;
    } else if (line.startsWith("-")) {
      result.push({
        type: "del",
        oldLineNumber: oldLine,
        content: line.slice(1),
      });
      oldLine++;
    } else if (line.startsWith("\\")) {
      result.push({
        type: "info",
        content: line.trim(),
      });
    } else {
      result.push({
        type: "normal",
        oldLineNumber: oldLine,
        newLineNumber: newLine,
        content: line.startsWith(" ") ? line.slice(1) : line,
      });
      oldLine++;
      newLine++;
    }
  }

  return result;
}

export function buildSplitRows(lines: DiffLine[]): SplitRow[] {
  const rows: SplitRow[] = [];
  let delBuffer: DiffLine[] = [];
  let addBuffer: DiffLine[] = [];

  const flushBuffers = () => {
    const maxLen = Math.max(delBuffer.length, addBuffer.length);
    for (let i = 0; i < maxLen; i++) {
      const d = delBuffer[i];
      const a = addBuffer[i];
      rows.push({
        type: "diff",
        left: d
          ? {
              type: "del",
              lineNumber: d.oldLineNumber || 0,
              content: d.content,
            }
          : null,
        right: a
          ? {
              type: "add",
              lineNumber: a.newLineNumber || 0,
              content: a.content,
            }
          : null,
      });
    }
    delBuffer = [];
    addBuffer = [];
  };

  for (const item of lines) {
    if (item.type === "normal" || item.type === "info") {
      flushBuffers();
      rows.push({
        type: "diff",
        left:
          item.type === "normal"
            ? {
                type: "normal",
                lineNumber: item.oldLineNumber || 0,
                content: item.content,
              }
            : null,
        right:
          item.type === "normal"
            ? {
                type: "normal",
                lineNumber: item.newLineNumber || 0,
                content: item.content,
              }
            : null,
      });
    } else if (item.type === "del") {
      delBuffer.push(item);
    } else if (item.type === "add") {
      addBuffer.push(item);
    }
  }

  flushBuffers();
  return rows;
}

interface DiffViewerProps {
  diffText: string;
  filePath: string;
  additions?: number;
  deletions?: number;
  isExpandedModal?: boolean;
  isMaximized?: boolean;
  onToggleMaximize?: () => void;
  onToggleExpandModal?: () => void;
  onCloseModal?: () => void;
}

export const DiffViewer: React.FC<DiffViewerProps> = ({
  diffText,
  filePath,
  additions,
  deletions,
  isExpandedModal = false,
  isMaximized = false,
  onToggleMaximize,
  onToggleExpandModal,
  onCloseModal,
}) => {
  const [viewMode, setViewMode] = useState<"unified" | "split">("unified");
  const [copied, setCopied] = useState(false);

  const parsedLines = useMemo(() => parseGitDiff(diffText), [diffText]);
  const splitRows = useMemo(() => buildSplitRows(parsedLines), [parsedLines]);

  const maxLine = useMemo(() => {
    let max = 0;
    for (const l of parsedLines) {
      if (l.oldLineNumber && l.oldLineNumber > max) max = l.oldLineNumber;
      if (l.newLineNumber && l.newLineNumber > max) max = l.newLineNumber;
    }
    return max;
  }, [parsedLines]);

  const gutterWidth = Math.max(28, (maxLine.toString().length || 1) * 7.5 + 14);

  const handleCopy = () => {
    navigator.clipboard.writeText(diffText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const fileName = filePath.split(/[/\\]/).pop() || filePath;

  if (!diffText || diffText.trim() === "") {
    return (
      <div className="diff-empty-notice">
        此文件无文本差异或为二进制文件
      </div>
    );
  }

  const renderContent = () => {
    if (viewMode === "split") {
      return (
        <div className="diff-split-container">
          <div className="diff-split-header">
            <div className="diff-split-side-title">变更前 (Original)</div>
            <div className="diff-split-side-title">变更后 (Modified)</div>
          </div>
          <div className="diff-split-rows-table">
            {splitRows.map((row, idx) => (
              <div key={idx} className="diff-split-row">
                {/* 左侧：原文件 */}
                <div className={`diff-split-cell left ${row.left ? (row.left.type === "del" ? "diff-del-row" : "diff-normal-row") : "diff-empty-cell"}`}>
                  <div className="diff-col-gutter" style={{ width: `${gutterWidth}px` }}>
                    {row.left?.lineNumber || ""}
                  </div>
                  <div className="diff-col-sign">
                    {row.left?.type === "del" ? "-" : " "}
                  </div>
                  <div className="diff-col-code">
                    {row.left?.content || ""}
                  </div>
                </div>

                {/* 右侧：新文件 */}
                <div className={`diff-split-cell right ${row.right ? (row.right.type === "add" ? "diff-add-row" : "diff-normal-row") : "diff-empty-cell"}`}>
                  <div className="diff-col-gutter" style={{ width: `${gutterWidth}px` }}>
                    {row.right?.lineNumber || ""}
                  </div>
                  <div className="diff-col-sign">
                    {row.right?.type === "add" ? "+" : " "}
                  </div>
                  <div className="diff-col-code">
                    {row.right?.content || ""}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      );
    }

    // 单栏 Unified 模式 (含旧行号与新行号独立双列)
    return (
      <div className="diff-unified-container">
        <div className="diff-lines-table">
          {parsedLines.map((line, idx) => {
            const rowClass =
              line.type === "add"
                ? "diff-add-row"
                : line.type === "del"
                ? "diff-del-row"
                : line.type === "info"
                ? "diff-info-row"
                : "diff-normal-row";

            const signChar =
              line.type === "add"
                ? "+"
                : line.type === "del"
                ? "-"
                : line.type === "info"
                ? " "
                : " ";

            return (
              <div key={idx} className={`diff-row ${rowClass}`}>
                {/* 旧行号 */}
                <div className="diff-col-gutter" style={{ width: `${gutterWidth}px` }}>
                  {line.oldLineNumber ?? ""}
                </div>
                {/* 新行号 */}
                <div className="diff-col-gutter" style={{ width: `${gutterWidth}px` }}>
                  {line.newLineNumber ?? ""}
                </div>
                <div className="diff-col-sign">{signChar}</div>
                <div className="diff-col-code">{line.content}</div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const containerClass = isExpandedModal
    ? "diff-viewer-root diff-viewer-expanded"
    : "diff-viewer-root diff-viewer-inline";

  return (
    <div className={containerClass}>
      {/* 顶部工具与控制条 */}
      <div className="diff-viewer-toolbar">
        <div className="diff-viewer-file-info">
          <FileIcon filename={fileName} size={14} />
          <span className="diff-viewer-path" title={filePath}>{filePath}</span>
          {(additions !== undefined || deletions !== undefined) && (
            <div className="diff-stat-pills">
              {Boolean(additions && additions > 0) && (
                <span className="diff-pill-add">+{additions}</span>
              )}
              {Boolean(deletions && deletions > 0) && (
                <span className="diff-pill-del">-{deletions}</span>
              )}
            </div>
          )}
        </div>

        <div className="diff-viewer-actions">
          {/* 模式切换 */}
          <div className="diff-mode-switcher">
            <button
              type="button"
              className={`diff-mode-btn ${viewMode === "unified" ? "active" : ""}`}
              onClick={() => setViewMode("unified")}
              title="单栏行内对比"
            >
              <Rows3 size={13} />
              <span>单栏</span>
            </button>
            <button
              type="button"
              className={`diff-mode-btn ${viewMode === "split" ? "active" : ""}`}
              onClick={() => setViewMode("split")}
              title="左右分栏对比"
            >
              <Columns2 size={13} />
              <span>分栏</span>
            </button>
          </div>

          {/* 复制 Diff */}
          <button
            type="button"
            className="diff-tool-btn"
            onClick={handleCopy}
            title="复制 Diff 文本"
          >
            {copied ? <Check size={13} color="var(--diff-add-text)" /> : <Copy size={13} />}
          </button>

          {/* 放大/全屏展开 */}
          {onToggleExpandModal && (
            <button
              type="button"
              className="diff-tool-btn"
              onClick={onToggleExpandModal}
              title={isExpandedModal ? "还原窗口" : "大窗口独立查看"}
            >
              {isExpandedModal ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
            </button>
          )}

          {/* 弹窗模式下的最大化 / 还原窗口 */}
          {isExpandedModal && onToggleMaximize && (
            <button
              type="button"
              className="diff-tool-btn"
              onClick={onToggleMaximize}
              title={isMaximized ? "还原窗口" : "最大化"}
            >
              {isMaximized ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
            </button>
          )}

          {/* 模态框关闭按钮 */}
          {isExpandedModal && onCloseModal && (
            <button
              type="button"
              className="diff-tool-btn diff-close-modal-btn"
              onClick={onCloseModal}
              title="关闭 (Esc)"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Diff 内容滚动区域 */}
      <div className="diff-viewer-scroll-body">
        {renderContent()}
      </div>
    </div>
  );
};
