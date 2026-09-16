import React from "react";
import { Tag, Search, RefreshCw } from "lucide-react";
import { GitGraphOverlay, computeGitGraph } from "./GitGraphView";
import type { CommitItem } from "../types";

interface CommitListProps {
  commits: CommitItem[];
  selectedSha: string;
  graphWidth: number;
  searchQuery: string;
  hasMore: boolean;
  isLoadingMore: boolean;
  onSelectCommit: (sha: string) => void;
  onSearchChange: (q: string) => void;
  onLoadMore: () => void;
}

export const CommitList: React.FC<CommitListProps> = ({
  commits,
  selectedSha,
  graphWidth,
  searchQuery,
  hasMore,
  isLoadingMore,
  onSelectCommit,
  onSearchChange,
  onLoadMore,
}) => {
  const { graphWidth: computedWidth } = React.useMemo(
    () => computeGitGraph(commits),
    [commits]
  );
  const gw = graphWidth || computedWidth;

  return (
    <section className="git-log-view">
      {/* 搜索栏 */}
      <div className="commit-search-bar">
        <Search size={13} className="commit-search-icon" />
        <input
          className="commit-search-input"
          type="text"
          placeholder="搜索提交信息、作者或 SHA..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
        />
        {searchQuery && (
          <span className="commit-search-count">
            {commits.length} 条结果
          </span>
        )}
      </div>

      <div className="table-scroll-view">
        <div className="table-scroll-canvas">
          {commits.length > 0 && (
            <GitGraphOverlay commits={commits} selectedSha={selectedSha} />
          )}

          <div className="commit-rows-stream">
            {commits.map((c) => {
              const isRowActive = c.sha === selectedSha;
              return (
                <div
                  key={c.sha}
                  className={`commit-line-row ${isRowActive ? "active" : ""}`}
                  onClick={() => onSelectCommit(c.sha)}
                >
                  <div style={{ width: `${gw}px`, flexShrink: 0 }} />

                  <div className="col-m-title">
                    <span>{c.msg}</span>
                  </div>

                  <div className="col-r-tags">
                    {c.ref_tags?.length > 0 && (
                      <div className="ref-tags-container">
                        {c.ref_tags.map((tag) => (
                          <span
                            key={tag.name}
                            className={`ref-tag-pill ${
                              tag.is_head
                                ? "head-tag"
                                : tag.is_tag
                                ? "version-tag"
                                : "branch-tag"
                            }`}
                            title={
                              tag.is_head
                                ? `当前检出分支: ${tag.name}`
                                : `分支: ${tag.name}`
                            }
                          >
                            <Tag size={10} />
                            <span>{tag.name}</span>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="col-a-author">
                    <span>{c.author}</span>
                  </div>

                  <div className="col-d-date" title={c.date}>
                    {c.date}
                  </div>
                </div>
              );
            })}

            {commits.length === 0 && (
              <div className="empty-view-state">
                <span>
                  {searchQuery ? "没有匹配的提交记录" : "该仓库暂无提交记录"}
                </span>
              </div>
            )}
          </div>

          {/* 加载更多 */}
          {hasMore && !searchQuery && (
            <div className="load-more-row">
              <button
                type="button"
                className="load-more-btn"
                onClick={onLoadMore}
                disabled={isLoadingMore}
              >
                {isLoadingMore ? (
                  <>
                    <RefreshCw size={13} className="spin-icon" />
                    <span>加载中...</span>
                  </>
                ) : (
                  <span>加载更多提交</span>
                )}
              </button>
            </div>
          )}
        </div>
      </div>
    </section>
  );
};
