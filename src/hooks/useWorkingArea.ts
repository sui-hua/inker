import { useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { StatusFile } from "../types";

export function useWorkingArea(
  activeRepoPath: string,
  showToast: (msg: string) => void,
  onAfterCommit: () => void
) {
  const [workingFiles, setWorkingFiles] = useState<StatusFile[]>([]);
  const [selectedWorkingFiles, setSelectedWorkingFiles] = useState<string[]>([]);
  const [commitMessage, setCommitMessage] = useState("");
  const [isCommitting, setIsCommitting] = useState(false);
  const [isPushing, setIsPushing] = useState(false);
  const [isPulling, setIsPulling] = useState(false);
  const [isFetching, setIsFetching] = useState(false);
  const [activeWorkingDiff, setActiveWorkingDiff] = useState<{
    path: string;
    diffText: string;
  } | null>(null);
  const [isWorkingDiffMaximized, setIsWorkingDiffMaximized] = useState(false);

  const applyWorkingFiles = useCallback((files: StatusFile[]) => {
    setWorkingFiles(files);
    setSelectedWorkingFiles(files.map((f) => f.path));
  }, []);

  const handleViewWorkingDiff = useCallback(
    async (file: StatusFile) => {
      if (!activeRepoPath) return;
      try {
        const diff = await invoke<string>("get_working_diff", {
          repoPath: activeRepoPath,
          filePath: file.path,
          staged: file.staged,
        });
        setActiveWorkingDiff({ path: file.path, diffText: diff });
      } catch (err) {
        showToast(`获取文件差异失败: ${String(err)}`);
      }
    },
    [activeRepoPath, showToast]
  );

  const handleCommitWorkingChanges = useCallback(async () => {
    if (!activeRepoPath) return;
    if (!commitMessage.trim()) {
      showToast("请输入提交说明");
      return;
    }
    if (selectedWorkingFiles.length === 0) {
      showToast("请至少选择一个文件");
      return;
    }
    setIsCommitting(true);
    try {
      // 传递选中文件列表与其中已暂存的文件列表，后端按需 add
      const stagedFiles = workingFiles
        .filter((f) => f.staged && selectedWorkingFiles.includes(f.path))
        .map((f) => f.path);

      await invoke<string>("commit_working_changes", {
        repoPath: activeRepoPath,
        message: commitMessage,
        files: selectedWorkingFiles,
        stagedFiles,
      });
      showToast("提交成功");
      setCommitMessage("");
      onAfterCommit();
    } catch (err) {
      showToast(`提交失败: ${String(err)}`);
    } finally {
      setIsCommitting(false);
    }
  }, [
    activeRepoPath,
    commitMessage,
    selectedWorkingFiles,
    workingFiles,
    showToast,
    onAfterCommit,
  ]);

  const handlePushRemote = useCallback(async () => {
    if (!activeRepoPath) return;
    setIsPushing(true);
    try {
      await invoke<string>("push_remote", {
        repoPath: activeRepoPath,
        remote: null,
        branch: null,
      });
      showToast("推送成功");
      onAfterCommit();
    } catch (err) {
      showToast(`推送失败: ${String(err)}`);
    } finally {
      setIsPushing(false);
    }
  }, [activeRepoPath, showToast, onAfterCommit]);

  const handlePullRemote = useCallback(async () => {
    if (!activeRepoPath) return;
    setIsPulling(true);
    try {
      await invoke<string>("pull_remote", {
        repoPath: activeRepoPath,
        remote: null,
        branch: null,
      });
      showToast("拉取成功");
      onAfterCommit();
    } catch (err) {
      showToast(`拉取失败: ${String(err)}`);
    } finally {
      setIsPulling(false);
    }
  }, [activeRepoPath, showToast, onAfterCommit]);

  const handleFetchRemote = useCallback(async () => {
    if (!activeRepoPath) return;
    setIsFetching(true);
    try {
      await invoke<string>("fetch_remote", {
        repoPath: activeRepoPath,
        remote: null,
      });
      showToast("Fetch 完成");
      onAfterCommit();
    } catch (err) {
      showToast(`Fetch 失败: ${String(err)}`);
    } finally {
      setIsFetching(false);
    }
  }, [activeRepoPath, showToast, onAfterCommit]);

  const closeWorkingDiff = useCallback(() => {
    setActiveWorkingDiff(null);
    setIsWorkingDiffMaximized(false);
  }, []);

  return {
    workingFiles,
    setWorkingFiles: applyWorkingFiles,
    selectedWorkingFiles,
    setSelectedWorkingFiles,
    commitMessage,
    setCommitMessage,
    isCommitting,
    isPushing,
    isPulling,
    isFetching,
    activeWorkingDiff,
    isWorkingDiffMaximized,
    setIsWorkingDiffMaximized,
    handleViewWorkingDiff,
    handleCommitWorkingChanges,
    handlePushRemote,
    handlePullRemote,
    handleFetchRemote,
    closeWorkingDiff,
  };
}
