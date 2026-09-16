import React from "react";
import { GitBranch, GitMerge, GitCommit, X, GitFork } from "lucide-react";
import type { ContextMenuState, RepoDetails, CreateBranchModalState } from "../types";

interface BranchContextMenuProps {
  contextMenu: ContextMenuState;
  repoDetails: RepoDetails | null;
  onCheckout: (branchName: string) => void;
  onMerge: (sourceBranch: string, isSquash: boolean) => void;
  onCreateBranch: (state: CreateBranchModalState) => void;
  onDelete: (branchName: string) => void;
  onClose: () => void;
}

export const BranchContextMenu: React.FC<BranchContextMenuProps> = ({
  contextMenu,
  repoDetails,
  onCheckout,
  onMerge,
  onCreateBranch,
  onDelete,
  onClose,
}) => {
  const cur = repoDetails?.repo.branch || "HEAD";

  return (
    <div
      className="branch-context-menu"
      style={{ top: `${contextMenu.y}px`, left: `${contextMenu.x}px` }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="context-menu-header">
        <GitBranch size={12} />
        <span>{contextMenu.branchName}</span>
      </div>
      <div className="context-menu-divider" />

      <button
        type="button"
        className="context-menu-item"
        disabled={contextMenu.isHead}
        onClick={() => {
          const target = contextMenu.isRemote
            ? contextMenu.branchName.replace(/^[^/]+\//, "")
            : contextMenu.branchName;
          onCheckout(target);
          onClose();
        }}
      >
        <GitBranch size={13} />
        <span>
          {contextMenu.isRemote ? "检出为本地分支" : "检出并切换至此分支"}
        </span>
      </button>

      <button
        type="button"
        className="context-menu-item"
        disabled={contextMenu.isHead}
        onClick={() => {
          onMerge(contextMenu.branchName, false);
          onClose();
        }}
      >
        <GitMerge size={13} />
        <span>合并到当前分支 ({cur})</span>
      </button>

      <button
        type="button"
        className="context-menu-item"
        disabled={contextMenu.isHead}
        onClick={() => {
          onMerge(contextMenu.branchName, true);
          onClose();
        }}
      >
        <GitCommit size={13} />
        <span>Squash 合并到当前分支...</span>
      </button>

      {!contextMenu.isRemote && (
        <>
          <div className="context-menu-divider" />
          <button
            type="button"
            className="context-menu-item"
            onClick={() => {
              onCreateBranch({
                visible: true,
                baseBranch: contextMenu.branchName,
                newName: "",
              });
              onClose();
            }}
          >
            <GitFork size={13} />
            <span>基于此分支新建分支...</span>
          </button>

          <button
            type="button"
            className="context-menu-item danger"
            disabled={contextMenu.isHead}
            onClick={() => {
              onDelete(contextMenu.branchName);
            }}
          >
            <X size={13} />
            <span>删除此分支</span>
          </button>
        </>
      )}
    </div>
  );
};
