import { useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import type {
  CommitItem,
  RepoDetails,
  ContextMenuState,
  MergeModalState,
  CreateBranchModalState,
} from "../types";

export function useBranchActions(
  activeRepoPath: string,
  _repoDetails: RepoDetails | null,
  setRepoDetails: React.Dispatch<React.SetStateAction<RepoDetails | null>>,
  showToast: (msg: string) => void,
  onRefresh: () => void
) {
  const [filterBranch, setFilterBranch] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [mergeModal, setMergeModal] = useState<MergeModalState | null>(null);
  const [createBranchModal, setCreateBranchModal] =
    useState<CreateBranchModalState | null>(null);
  const [loading, setLoading] = useState(false);

  const applyBranchFilter = useCallback(
    async (branchName: string | null, commits?: CommitItem[]) => {
      if (!activeRepoPath) return;
      setFilterBranch(branchName);
      if (commits) {
        setRepoDetails((prev) => (prev ? { ...prev, commits } : prev));
        return;
      }
      try {
        const result = await invoke<CommitItem[]>("get_commits", {
          repoPath: activeRepoPath,
          branch: branchName || null,
          offset: 0,
        });
        setRepoDetails((prev) => (prev ? { ...prev, commits: result, has_more: result.length >= 100 } : prev));
      } catch (err) {
        showToast("过滤分支历史失败: " + String(err));
        setFilterBranch(null);
      }
    },
    [activeRepoPath, setRepoDetails, showToast]
  );

  const handleBranchClick = useCallback(
    (branchName: string) => {
      if (filterBranch === branchName) return;
      applyBranchFilter(branchName);
    },
    [filterBranch, applyBranchFilter]
  );

  const handleCheckoutBranch = useCallback(
    async (branchName: string) => {
      if (!activeRepoPath) return;

      // 检查是否有未提交改动，给出预警
      try {
        const status = await invoke<{ path: string; staged: boolean }[]>(
          "get_working_status",
          { repoPath: activeRepoPath }
        );
        if (status.length > 0) {
          showToast(`注意：工作区有 ${status.length} 个未提交文件，切换分支可能失败`);
        }
      } catch {
        // 忽略状态检查错误
      }

      // 乐观更新 UI
      setRepoDetails((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          repo: { ...prev.repo, branch: branchName },
          local_branches: prev.local_branches.map((b) => ({
            ...b,
            is_head: b.name === branchName,
          })),
        };
      });

      try {
        await invoke("checkout_branch", {
          repoPath: activeRepoPath,
          branchName,
        });
        showToast(`已检出分支: ${branchName}`);
        onRefresh();
      } catch (err) {
        showToast(`切换失败: ${String(err)}`);
        onRefresh();
      }
    },
    [activeRepoPath, setRepoDetails, showToast, onRefresh]
  );

  const handleExecuteMerge = useCallback(async () => {
    if (!mergeModal || !activeRepoPath) return;
    setLoading(true);
    try {
      await invoke<string>("merge_branch", {
        repoPath: activeRepoPath,
        sourceBranch: mergeModal.sourceBranch,
        isSquash: mergeModal.isSquash,
        commitMsg: mergeModal.commitMsg.trim() || null,
      });
      showToast(
        `${mergeModal.isSquash ? "Squash 合并" : "合并"}成功: ${mergeModal.sourceBranch} -> ${mergeModal.targetBranch}`
      );
      setMergeModal(null);

      // 合并后检查冲突
      try {
        const status = await invoke<{ path: string; status: string }[]>(
          "get_working_status",
          { repoPath: activeRepoPath }
        );
        const conflicts = status.filter((f) =>
          ["U", "A", "D"].some((s) => f.status === s)
        );
        if (conflicts.length > 0) {
          showToast(
            `⚠️ 发现 ${conflicts.length} 个冲突文件，请在工作区手动解决后再提交`
          );
        }
      } catch {}

      onRefresh();
    } catch (err) {
      showToast(`合并失败: ${String(err)}`);
    } finally {
      setLoading(false);
    }
  }, [mergeModal, activeRepoPath, showToast, onRefresh]);

  const handleCreateBranch = useCallback(async () => {
    if (!createBranchModal || !activeRepoPath) return;
    const name = createBranchModal.newName.trim();
    if (!name) {
      showToast("分支名不能为空");
      return;
    }
    try {
      await invoke("create_branch", {
        repoPath: activeRepoPath,
        branchName: name,
        from: createBranchModal.baseBranch || null,
      });
      showToast(`已创建并切换到新分支: ${name}`);
      setCreateBranchModal(null);
      onRefresh();
    } catch (err) {
      showToast(`创建分支失败: ${String(err)}`);
    }
  }, [createBranchModal, activeRepoPath, showToast, onRefresh]);

  const handleDeleteBranch = useCallback(
    async (branchName: string, force = false) => {
      if (!activeRepoPath) return;
      try {
        await invoke("delete_branch", {
          repoPath: activeRepoPath,
          branchName,
          force,
        });
        showToast(`已删除分支: ${branchName}`);
        setContextMenu(null);
        onRefresh();
      } catch (err) {
        // 如果普通删除失败（未合并），提示用户是否强制删除
        if (!force && String(err).includes("not fully merged")) {
          showToast(`分支 ${branchName} 尚未合并，如需强制删除请再次操作`);
        } else {
          showToast(`删除分支失败: ${String(err)}`);
        }
      }
    },
    [activeRepoPath, showToast, onRefresh]
  );

  return {
    filterBranch,
    setFilterBranch,
    contextMenu,
    setContextMenu,
    mergeModal,
    setMergeModal,
    createBranchModal,
    setCreateBranchModal,
    mergeLoading: loading,
    applyBranchFilter,
    handleBranchClick,
    handleCheckoutBranch,
    handleExecuteMerge,
    handleCreateBranch,
    handleDeleteBranch,
  };
}
