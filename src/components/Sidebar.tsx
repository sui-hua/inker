import React from "react";
import {
  ChevronDown,
  GitBranch,
  Globe,
  GitCommit,
  RefreshCw,
  Check,
  CheckSquare,
  Square,
  Folder,
  UploadCloud,
  X,
} from "lucide-react";
import { FileIcon } from "./FileIcon";
import { StashPanel } from "./StashPanel";
import type {
  RepoDetails,
  StatusFile,
  ContextMenuState,
  StashItem,
} from "../types";

interface GroupedBranches {
  root: { name: string; is_head: boolean; is_remote: boolean; remote: string }[];
  groups: {
    folder: string;
    items: {
      branch: { name: string; is_head: boolean; is_remote: boolean; remote: string };
      shortName: string;
    }[];
  }[];
}

interface SidebarProps {
  repoDetails: RepoDetails | null;
  workingFiles: StatusFile[];
  selectedWorkingFiles: string[];
  commitMessage: string;
  isCommitting: boolean;
  isPushing: boolean;
  workingChangesOpen: boolean;
  localBranchesOpen: boolean;
  remoteBranchesOpen: boolean;
  filterBranch: string | null;
  collapsedBranchFolders: Record<string, boolean>;
  groupedLocalBranches: GroupedBranches;
  // stash
  stashes: StashItem[];
  stashMessage: string;
  isStashOpen: boolean;
  onToggleStash: () => void;
  onStashMessageChange: (msg: string) => void;
  onStashSave: () => void;
  onStashPop: (index: number) => void;
  onStashApply: (index: number) => void;
  onStashDrop: (index: number) => void;
  onToggleWorkingChanges: () => void;
  onToggleLocalBranches: () => void;
  onToggleRemoteBranches: () => void;
  onSelectFile: (file: StatusFile) => void;
  onToggleFileCheck: (e: React.MouseEvent, path: string) => void;
  onSelectAll: () => void;
  onRefreshWorking: () => void;
  onCommit: () => void;
  onPush: () => void;
  onCommitMessageChange: (msg: string) => void;
  onBranchClick: (name: string) => void;
  onBranchContextMenu: (e: React.MouseEvent, state: ContextMenuState) => void;
  onToggleBranchFolder: (folder: string) => void;
  onClearBranchFilter: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  repoDetails,
  workingFiles,
  selectedWorkingFiles,
  commitMessage,
  isCommitting,
  isPushing,
  workingChangesOpen,
  localBranchesOpen,
  remoteBranchesOpen,
  filterBranch,
  collapsedBranchFolders,
  groupedLocalBranches,
  stashes,
  stashMessage,
  isStashOpen,
  onToggleStash,
  onStashMessageChange,
  onStashSave,
  onStashPop,
  onStashApply,
  onStashDrop,
  onToggleWorkingChanges,
  onToggleLocalBranches,
  onToggleRemoteBranches,
  onSelectFile,
  onToggleFileCheck,
  onSelectAll,
  onRefreshWorking,
  onCommit,
  onPush,
  onCommitMessageChange,
  onBranchClick,
  onBranchContextMenu,
  onToggleBranchFolder,
  onClearBranchFilter,
}) => {
  const allChecked =
    workingFiles.length > 0 &&
    selectedWorkingFiles.length === workingFiles.length;

  // 远程分支按 remote 名分组
  const remoteGroups = (repoDetails?.remote_branches ?? []).reduce(
    (acc, b) => {
      const key = b.remote || "origin";
      if (!acc[key]) acc[key] = [];
      acc[key].push(b);
      return acc;
    },
    {} as Record<string, NonNullable<typeof repoDetails>["remote_branches"]>
  );

  return (
    <div className="sidebar-scroll-zone">
      {/* 手风琴 1：工作区变更 */}
      <div className="accordion-section working-section">
        <div className="accordion-header-btn" onClick={onToggleWorkingChanges}>
          <div className="accordion-header-left">
            <ChevronDown
              size={12}
              className={`accordion-chevron-icon ${workingChangesOpen ? "open" : ""}`}
            />
            <GitCommit size={13} className="accordion-section-icon" />
            <span className="accordion-title">工作区变更</span>
          </div>
          <div className="accordion-header-right">
            <span
              className={`accordion-count-badge ${workingFiles.length > 0 ? "has-changes" : ""}`}
            >
              {workingFiles.length}
            </span>
          </div>
        </div>

        <div
          className={`accordion-collapse-wrapper ${workingChangesOpen ? "expanded" : "collapsed"}`}
        >
          <div className="accordion-collapse-inner">
            <div className="sidebar-changes-zone">
              <div className="changes-zone-header">
                <div className="changes-zone-title">
                  <span>待提交清单</span>
                  <span className="changes-count-pill">{workingFiles.length}</span>
                </div>
                <div className="changes-header-actions">
                  <button
                    type="button"
                    className="changes-action-mini-btn"
                    onClick={onSelectAll}
                    title={allChecked ? "取消全选" : "全部选中"}
                  >
                    {allChecked ? <CheckSquare size={13} /> : <Square size={13} />}
                  </button>
                  <button
                    type="button"
                    className="changes-action-mini-btn"
                    onClick={onRefreshWorking}
                    title="刷新工作区状态"
                  >
                    <RefreshCw size={12} />
                  </button>
                </div>
              </div>

              <div className="changes-file-list">
                {workingFiles.length === 0 ? (
                  <div className="changes-empty-hint">
                    <Check size={16} color="var(--diff-add-text)" />
                    <span>工作区干净，无未提交文件</span>
                  </div>
                ) : (
                  workingFiles.map((file) => {
                    const isChecked = selectedWorkingFiles.includes(file.path);
                    const fileName = file.path.split(/[/\\]/).pop() || file.path;
                    return (
                      <div
                        key={file.path}
                        className="changes-file-row"
                        onClick={() => onSelectFile(file)}
                        title={`点击比对差异: ${file.path}`}
                      >
                        <span
                          className="changes-checkbox"
                          onClick={(e) => onToggleFileCheck(e, file.path)}
                        >
                          {isChecked ? (
                            <CheckSquare size={13} color="var(--ink)" />
                          ) : (
                            <Square size={13} color="var(--ink-tertiary)" />
                          )}
                        </span>
                        <FileIcon filename={fileName} size={14} />
                        <span className="changes-file-name" title={file.path}>
                          {fileName}
                        </span>
                        <span
                          className={`changes-status-badge status-${file.status.toLowerCase()} ${
                            file.status === "U" ? "status-conflict" : ""
                          }`}
                        >
                          {file.status === "U" ? "⚠" : file.status}
                        </span>
                      </div>
                    );
                  })
                )}
              </div>

              <div className="changes-commit-panel">
                <textarea
                  className="changes-commit-input"
                  rows={2}
                  placeholder="填写本次提交说明 (Ctrl+Enter 快捷提交)..."
                  value={commitMessage}
                  onChange={(e) => onCommitMessageChange(e.target.value)}
                  onKeyDown={(e) => {
                    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                      e.preventDefault();
                      onCommit();
                    }
                  }}
                />
                <div className="changes-commit-actions">
                  <button
                    type="button"
                    className="changes-commit-btn primary"
                    disabled={isCommitting || workingFiles.length === 0}
                    onClick={onCommit}
                  >
                    <GitCommit size={13} />
                    <span>
                      {isCommitting
                        ? "提交中..."
                        : `提交 (${selectedWorkingFiles.length})`}
                    </span>
                  </button>
                  <button
                    type="button"
                    className="changes-commit-btn secondary"
                    disabled={isPushing}
                    onClick={onPush}
                    title="推送到远程 (git push)"
                  >
                    <UploadCloud
                      size={13}
                      className={isPushing ? "spin-icon" : ""}
                    />
                    <span>{isPushing ? "推送中..." : "推送"}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 手风琴 1.5：暂存区 Stash */}
      <StashPanel
        stashes={stashes}
        stashMessage={stashMessage}
        isOpen={isStashOpen}
        onToggle={onToggleStash}
        onMessageChange={onStashMessageChange}
        onSave={onStashSave}
        onPop={onStashPop}
        onApply={onStashApply}
        onDrop={onStashDrop}
      />

      {/* 手风琴 2：本地分支 */}
      <div className="accordion-section local-section">
        <div className="accordion-header-btn" onClick={onToggleLocalBranches}>
          <div className="accordion-header-left">
            <ChevronDown
              size={12}
              className={`accordion-chevron-icon ${localBranchesOpen ? "open" : ""}`}
            />
            <GitBranch size={13} className="accordion-section-icon" />
            <span className="accordion-title">本地分支</span>
          </div>
          <div className="accordion-header-right">
            <span className="accordion-count-badge">
              {repoDetails?.local_branches.length || 0}
            </span>
          </div>
        </div>

        <div
          className={`accordion-collapse-wrapper ${localBranchesOpen ? "expanded" : "collapsed"}`}
        >
          <div className="accordion-collapse-inner">
            <div className="accordion-body">
              {groupedLocalBranches.root.map((b) => {
                const isSelected = filterBranch === b.name;
                return (
                  <div
                    key={b.name}
                    className={`tree-node-item ${isSelected ? "selected-filter" : ""}`}
                    onClick={() => onBranchClick(b.name)}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onBranchContextMenu(e, {
                        visible: true,
                        x: e.clientX,
                        y: e.clientY,
                        branchName: b.name,
                        isHead: b.is_head,
                        isRemote: false,
                      });
                    }}
                    title={`单击聚焦查看 ${b.name}，右键检出或合并`}
                  >
                    <GitBranch size={13} />
                    <span className="branch-name-text">{b.name}</span>
                    {b.is_head && <span className="head-tag-badge">HEAD</span>}
                    {isSelected && (
                      <button
                        className="branch-clear-x"
                        onClick={(e) => {
                          e.stopPropagation();
                          onClearBranchFilter();
                        }}
                        title="关闭当前分支显示，恢复全部分支"
                      >
                        <X size={11} />
                      </button>
                    )}
                  </div>
                );
              })}

              {groupedLocalBranches.groups.map((g) => {
                const isFolderCollapsed = collapsedBranchFolders[g.folder];
                return (
                  <div key={g.folder} className="branch-folder-box">
                    <button
                      className="branch-folder-header"
                      onClick={() => onToggleBranchFolder(g.folder)}
                    >
                      <ChevronDown
                        size={11}
                        className={`folder-chevron-icon ${!isFolderCollapsed ? "open" : ""}`}
                        style={{ color: "var(--ink-tertiary)" }}
                      />
                      <Folder
                        size={13}
                        style={{ color: "var(--ink-secondary)" }}
                      />
                      <span>{g.folder}</span>
                    </button>

                    <div
                      className={`folder-collapse-wrapper ${!isFolderCollapsed ? "expanded" : "collapsed"}`}
                    >
                      <div className="folder-collapse-inner">
                        <div className="branch-folder-items">
                          {g.items.map(({ branch, shortName }) => {
                            const isSelected = filterBranch === branch.name;
                            return (
                              <div
                                key={branch.name}
                                className={`tree-node-item ${isSelected ? "selected-filter" : ""}`}
                                onClick={() => onBranchClick(branch.name)}
                                onContextMenu={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  onBranchContextMenu(e, {
                                    visible: true,
                                    x: e.clientX,
                                    y: e.clientY,
                                    branchName: branch.name,
                                    isHead: branch.is_head,
                                    isRemote: false,
                                  });
                                }}
                                title={`单击聚焦查看 ${branch.name}，右键检出或合并`}
                              >
                                <GitBranch size={13} />
                                <span className="branch-name-text">
                                  {shortName}
                                </span>
                                {branch.is_head && (
                                  <span className="head-tag-badge">HEAD</span>
                                )}
                                {isSelected && (
                                  <button
                                    className="branch-clear-x"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onClearBranchFilter();
                                    }}
                                    title="关闭当前分支显示，恢复全部分支"
                                  >
                                    <X size={11} />
                                  </button>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}

              {(!repoDetails || repoDetails.local_branches.length === 0) && (
                <div
                  style={{
                    padding: "6px 8px",
                    fontSize: "12px",
                    color: "var(--ink-tertiary)",
                  }}
                >
                  无本地分支
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 手风琴 3：远程分支（按 remote 分组） */}
      <div className="accordion-section remote-section">
        <div className="accordion-header-btn" onClick={onToggleRemoteBranches}>
          <div className="accordion-header-left">
            <ChevronDown
              size={12}
              className={`accordion-chevron-icon ${remoteBranchesOpen ? "open" : ""}`}
            />
            <Globe size={13} className="accordion-section-icon" />
            <span className="accordion-title">远程分支</span>
          </div>
          <div className="accordion-header-right">
            <span className="accordion-count-badge">
              {repoDetails?.remote_branches.length || 0}
            </span>
          </div>
        </div>

        <div
          className={`accordion-collapse-wrapper ${remoteBranchesOpen ? "expanded" : "collapsed"}`}
        >
          <div className="accordion-collapse-inner">
            <div className="accordion-body">
              {Object.entries(remoteGroups).map(([remoteName, branches]) => (
                <div key={remoteName}>
                  <div className="origin-head-row">
                    <Globe size={12} />
                    <span>{remoteName}</span>
                  </div>
                  <div className="origin-tree-guide">
                    {branches.map((b) => (
                      <div
                        key={b.name}
                        className="tree-node-item"
                        title={`远程分支 ${remoteName}/${b.name}，右键更多操作`}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          onBranchContextMenu(e, {
                            visible: true,
                            x: e.clientX,
                            y: e.clientY,
                            branchName: `${remoteName}/${b.name}`,
                            isHead: false,
                            isRemote: true,
                          });
                        }}
                      >
                        <GitBranch size={13} />
                        <span className="branch-name-text">{b.name}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              {(!repoDetails || repoDetails.remote_branches.length === 0) && (
                <div
                  style={{
                    padding: "4px 8px",
                    fontSize: "12px",
                    color: "var(--ink-tertiary)",
                  }}
                >
                  无远程分支
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
