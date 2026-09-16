import { useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { CommitItem, ChangedFile, RepoDetails } from "../types";

export function useCommitLog(
  activeRepoPath: string,
  repoDetails: RepoDetails | null,
  setRepoDetails: React.Dispatch<React.SetStateAction<RepoDetails | null>>,
  filesCache: Record<string, ChangedFile[]>,
  setFilesCache: React.Dispatch<React.SetStateAction<Record<string, ChangedFile[]>>>,
  showToast: (msg: string) => void
) {
  const [selectedSha, setSelectedSha] = useState("");
  const [detailsCollapsed, setDetailsCollapsed] = useState(true);
  const [copied, setCopied] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  const filteredCommits = repoDetails?.commits.filter((c) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      c.msg.toLowerCase().includes(q) ||
      c.author.toLowerCase().includes(q) ||
      c.sha.toLowerCase().startsWith(q)
    );
  }) ?? [];

  const handleSelectCommit = useCallback(
    async (sha: string) => {
      setSelectedSha(sha);
      setDetailsCollapsed(false);
      if (!filesCache[sha] && activeRepoPath) {
        try {
          const files = await invoke<ChangedFile[]>("get_commit_diff", {
            repoPath: activeRepoPath,
            sha,
          });
          setFilesCache((prev) => ({ ...prev, [sha]: files }));
        } catch {
          // 忽略
        }
      }
    },
    [activeRepoPath, filesCache, setFilesCache]
  );

  const handleCopySha = useCallback((sha: string) => {
    navigator.clipboard.writeText(sha).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, []);

  const handleLoadMore = useCallback(async () => {
    if (!activeRepoPath || !repoDetails) return;
    setIsLoadingMore(true);
    try {
      const offset = repoDetails.commits.length;
      const more = await invoke<CommitItem[]>("get_commits", {
        repoPath: activeRepoPath,
        branch: null,
        offset,
      });
      setRepoDetails((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          commits: [...prev.commits, ...more],
          has_more: more.length >= 100,
        };
      });
    } catch (err) {
      showToast("加载更多失败: " + String(err));
    } finally {
      setIsLoadingMore(false);
    }
  }, [activeRepoPath, repoDetails, setRepoDetails, showToast]);

  const currentCommit =
    selectedSha && repoDetails
      ? repoDetails.commits.find((c) => c.sha === selectedSha) ?? null
      : null;

  const currentFiles = currentCommit
    ? (filesCache[currentCommit.sha] ?? currentCommit.files ?? [])
    : [];

  const diffStats = currentFiles.reduce(
    (acc, f) => ({ adds: acc.adds + f.additions, dels: acc.dels + f.deletions }),
    { adds: 0, dels: 0 }
  );

  return {
    selectedSha,
    setSelectedSha,
    detailsCollapsed,
    setDetailsCollapsed,
    copied,
    searchQuery,
    setSearchQuery,
    isLoadingMore,
    filteredCommits,
    currentCommit,
    currentFiles,
    diffStats,
    handleSelectCommit,
    handleCopySha,
    handleLoadMore,
  };
}
