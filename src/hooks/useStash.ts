import { useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { StashItem } from "../types";

export function useStash(
  activeRepoPath: string,
  showToast: (msg: string) => void,
  onAfterOp: () => void
) {
  const [stashes, setStashes] = useState<StashItem[]>([]);
  const [stashMessage, setStashMessage] = useState("");
  const [isStashOpen, setIsStashOpen] = useState(false);

  const refreshStashes = useCallback(async (path?: string) => {
    const target = path || activeRepoPath;
    if (!target) { setStashes([]); return; }
    try {
      const list = await invoke<StashItem[]>("list_stashes", { repoPath: target });
      setStashes(list);
    } catch {
      setStashes([]);
    }
  }, [activeRepoPath]);

  const handleStashSave = useCallback(async () => {
    if (!activeRepoPath) return;
    try {
      await invoke("stash_save", {
        repoPath: activeRepoPath,
        message: stashMessage.trim() || null,
      });
      showToast("已暂存工作区改动");
      setStashMessage("");
      await refreshStashes();
      onAfterOp();
    } catch (err) {
      showToast(`暂存失败: ${String(err)}`);
    }
  }, [activeRepoPath, stashMessage, showToast, refreshStashes, onAfterOp]);

  const handleStashPop = useCallback(async (index: number) => {
    if (!activeRepoPath) return;
    try {
      await invoke("stash_pop", { repoPath: activeRepoPath, index });
      showToast(`已弹出 stash@{${index}}`);
      await refreshStashes();
      onAfterOp();
    } catch (err) {
      showToast(`弹出失败: ${String(err)}`);
    }
  }, [activeRepoPath, showToast, refreshStashes, onAfterOp]);

  const handleStashApply = useCallback(async (index: number) => {
    if (!activeRepoPath) return;
    try {
      await invoke("stash_apply", { repoPath: activeRepoPath, index });
      showToast(`已应用 stash@{${index}}（stash 记录保留）`);
      onAfterOp();
    } catch (err) {
      showToast(`应用失败: ${String(err)}`);
    }
  }, [activeRepoPath, showToast, onAfterOp]);

  const handleStashDrop = useCallback(async (index: number) => {
    if (!activeRepoPath) return;
    try {
      await invoke("stash_drop", { repoPath: activeRepoPath, index });
      showToast(`已丢弃 stash@{${index}}`);
      await refreshStashes();
    } catch (err) {
      showToast(`丢弃失败: ${String(err)}`);
    }
  }, [activeRepoPath, showToast, refreshStashes]);

  return {
    stashes,
    stashMessage,
    setStashMessage,
    isStashOpen,
    setIsStashOpen,
    refreshStashes,
    handleStashSave,
    handleStashPop,
    handleStashApply,
    handleStashDrop,
  };
}
