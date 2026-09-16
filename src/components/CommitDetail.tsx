import React from "react";
import { ChevronUp, Copy, Check } from "lucide-react";
import { FileTreeView } from "./FileTreeView";
import type { CommitItem, ChangedFile } from "../types";

interface CommitDetailProps {
  currentCommit: CommitItem | null;
  currentFiles: ChangedFile[];
  diffStats: { adds: number; dels: number };
  activeRepoPath: string;
  detailsCollapsed: boolean;
  dockPosition: "bottom" | "right";
  detailsHeight: number;
  detailsWidth: number;
  isResizingDetails: boolean;
  copied: boolean;
  onToggleCollapse: () => void;
  onToggleDock: (e: React.MouseEvent) => void;
  onCopySha: (sha: string) => void;
  onResizeMouseDown: (e: React.MouseEvent) => void;
}

export const CommitDetail: React.FC<CommitDetailProps> = ({
  currentCommit,
  currentFiles,
  diffStats,
  activeRepoPath,
  detailsCollapsed,
  dockPosition,
  detailsHeight,
  detailsWidth,
  isResizingDetails,
  copied,
  onToggleCollapse,
  onToggleDock,
  onCopySha,
  onResizeMouseDown,
}) => (
  <div
    className={`commit-details-drawer dock-${dockPosition} ${
      detailsCollapsed ? "collapsed" : "expanded"
    } ${isResizingDetails ? "is-resizing" : ""}`}
    style={
      dockPosition === "bottom"
        ? { height: detailsCollapsed ? "36px" : `${detailsHeight}px` }
        : { width: detailsCollapsed ? "36px" : `${detailsWidth}px` }
    }
  >
    {!detailsCollapsed && (
      <div
        className={`details-resizer ${
          dockPosition === "bottom" ? "resizer-top" : "resizer-left"
        } ${isResizingDetails ? "resizing" : ""}`}
        onMouseDown={onResizeMouseDown}
      />
    )}

    {/* 顶部简要信息栏 */}
    <div
      className="commit-details-collapsed-bar"
      onClick={onToggleCollapse}
      title={detailsCollapsed ? "点击展开提交详情面板" : "点击收起提交详情面板"}
    >
      <div className="collapsed-bar-left">
        <span className="collapsed-bar-title">
          <ChevronUp
            size={13}
            className={`panel-chevron-icon ${
              dockPosition === "bottom"
                ? !detailsCollapsed
                  ? "rotated"
                  : ""
                : !detailsCollapsed
                ? "rotated-right"
                : "rotated-left"
            }`}
          />
          <span>提交详情</span>
        </span>
        {currentCommit && !detailsCollapsed && (
          <>
            <span
              className="sha-pill-badge"
              style={{ padding: "1px 6px", fontSize: "11px" }}
            >
              {currentCommit.sha}
            </span>
            <span className="collapsed-bar-msg">{currentCommit.msg}</span>
          </>
        )}
      </div>

      <div className="collapsed-bar-right">
        {currentCommit && currentFiles.length > 0 && !detailsCollapsed && (
          <div className="diff-tags-cluster">
            {diffStats.adds > 0 && (
              <span className="diff-watercolor-tag add">+{diffStats.adds}</span>
            )}
            {diffStats.dels > 0 && (
              <span className="diff-watercolor-tag del">-{diffStats.dels}</span>
            )}
          </div>
        )}

        <button
          type="button"
          className="panel-toggle-btn dock-switch-btn"
          onClick={onToggleDock}
          title={
            dockPosition === "bottom"
              ? "停靠到右侧 (Dock to right)"
              : "停靠到底部 (Dock to bottom)"
          }
        >
          {dockPosition === "bottom" ? (
            <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor">
              <rect
                x="1.5" y="1.5" width="13" height="13" rx="2"
                fill="none" stroke="currentColor" strokeWidth="1.3"
              />
              <rect x="9.5" y="2.5" width="4" height="11" rx="1" fill="currentColor" />
            </svg>
          ) : (
            <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor">
              <rect
                x="1.5" y="1.5" width="13" height="13" rx="2"
                fill="none" stroke="currentColor" strokeWidth="1.3"
              />
              <rect x="2.5" y="9.5" width="11" height="4" rx="1" fill="currentColor" />
            </svg>
          )}
        </button>

        <button
          className="panel-toggle-btn"
          onClick={(e) => {
            e.stopPropagation();
            onToggleCollapse();
          }}
          title={detailsCollapsed ? "展开详情面板" : "收起详情面板"}
        >
          <ChevronUp
            size={13}
            className={`panel-toggle-icon ${
              dockPosition === "bottom"
                ? !detailsCollapsed
                  ? "rotated"
                  : ""
                : !detailsCollapsed
                ? "rotated-right"
                : "rotated-left"
            }`}
          />
        </button>
      </div>
    </div>

    {/* 展开后的详细信息 */}
    <div className="commit-details-body-scroller">
      {currentCommit ? (
        <div className="commit-details-view-inner">
          <div className="details-header-row">
            <div className="commit-heading">{currentCommit.msg}</div>
          </div>

          <div className="commit-meta-cluster">
            <button
              className="sha-pill-badge"
              onClick={() =>
                onCopySha(currentCommit.full_sha || currentCommit.sha)
              }
              title="点击复制完整 SHA"
            >
              {copied ? <Check size={11} /> : <Copy size={11} />}
              <span>{copied ? "COPIED" : currentCommit.sha}</span>
            </button>

            <div className="author-info-unit">
              <span style={{ fontWeight: 600, color: "var(--ink)" }}>
                {currentCommit.author}
              </span>
              {currentCommit.author_email && (
                <span
                  style={{
                    fontSize: "12px",
                    color: "var(--ink-secondary)",
                    fontFamily: "var(--font-mono)",
                  }}
                >
                  &lt;{currentCommit.author_email}&gt;
                </span>
              )}
            </div>

            <span className="meta-split-dot">·</span>
            <div className="date-indicator-text">{currentCommit.date}</div>
          </div>

          <div className="horizontal-rule-hairline" />

          <div className="file-group-heading">
            <span>变更文件 ({currentFiles.length})</span>
            <span>
              +{diffStats.adds} / -{diffStats.dels}
            </span>
          </div>

          <FileTreeView
            files={currentFiles}
            repoPath={activeRepoPath}
            commitSha={currentCommit.sha}
          />

          {currentFiles.length === 0 && (
            <div
              style={{
                color: "var(--ink-tertiary)",
                fontSize: "12px",
                padding: "8px 0",
              }}
            >
              无文件变更或该提交为初始提交 / 合并空提交
            </div>
          )}
        </div>
      ) : (
        <div
          style={{
            color: "var(--ink-tertiary)",
            fontSize: "13px",
            padding: "24px 20px",
          }}
        >
          请在上方选择一条提交记录以查看文件变更
        </div>
      )}
    </div>
  </div>
);
