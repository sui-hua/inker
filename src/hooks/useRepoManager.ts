import { useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { STORAGE_KEYS } from "../constants/storage";
import type { RepoInfo, RepoDetails, ChangedFile, StatusFile } from "../types";

function loadReposFromStorage(): RepoInfo[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEYS.REPOS);
    return saved ? JSON.parse(saved) : [];
  } catch {
    return [];
  }
}

function saveReposToStorage(repos: RepoInfo[]) {
  localStorage.setItem(STORAGE_KEYS.REPOS, JSON.stringify(repos));
}

export function useRepoManager(showToast: (msg: string) => void) {
  const [repos, setRepos] = useState<RepoInfo[]>(loadReposFromStorage);
  const [activeRepoPath, setActiveRepoPath] = useState<string>(
    () => localStorage.getItem(STORAGE_KEYS.ACTIVE_REPO_PATH) || ""
  );
  const [repoDetails, setRepoDetails] = useState<RepoDetails | null>(null);
  const [loading, setLoading] = useState(false);
  const [filesCache, setFilesCache] = useState<Record<string, ChangedFile[]>>({});
  const [repoCache, setRepoCache] = useState<Record<string, RepoDetails>>({});
  const [workingCache, setWorkingCache] = useState<Record<string, StatusFile[]>>({});

  const saveRepos = useCallback((newRepos: RepoInfo[]) => {
    setRepos(newRepos);
    saveReposToStorage(newRepos);
  }, []);

  const refreshWorkingStatus = useCallback(
    async (path?: string, currentActive?: string) => {
      const targetPath = path || activeRepoPath;
      if (!targetPath) return { files: [] as StatusFile[], path: "" };
      try {
        const files = await invoke<StatusFile[]>("get_working_status", {
          repoPath: targetPath,
        });
        setWorkingCache((prev) => ({ ...prev, [targetPath]: files }));
        const active = currentActive || localStorage.getItem(STORAGE_KEYS.ACTIVE_REPO_PATH) || activeRepoPath;
        if (active === targetPath) {
          return { files, path: targetPath };
        }
        return { files: [] as StatusFile[], path: targetPath };
      } catch {
        return { files: [] as StatusFile[], path: targetPath };
      }
    },
    [activeRepoPath]
  );

  const loadRepo = useCallback(
    async (
      path: string,
      showLoadingIndicator = true,
      activate = true
    ): Promise<{ workingFiles: StatusFile[]; details: RepoDetails | null }> => {
      if (!path) return { workingFiles: [], details: null };

      if (activate) {
        setActiveRepoPath(path);
        localStorage.setItem(STORAGE_KEYS.ACTIVE_REPO_PATH, path);
      }

      if (showLoadingIndicator) setLoading(true);

      try {
        const details = await invoke<RepoDetails>("load_repository", { repoPath: path });
        setRepoCache((prev) => ({ ...prev, [path]: details }));

        const currentActive = localStorage.getItem(STORAGE_KEYS.ACTIVE_REPO_PATH);
        if (currentActive === path) {
          setRepoDetails(details);
        }

        setRepos((prev) => {
          const updated = prev.map((r) =>
            r.path === path ? { ...r, branch: details.repo.branch } : r
          );
          saveReposToStorage(updated);
          return updated;
        });

        if (details.commits?.length > 0) {
          const cacheUpdate: Record<string, ChangedFile[]> = {};
          for (const c of details.commits) {
            if (c.files?.length > 0) cacheUpdate[c.sha] = c.files;
          }
          setFilesCache((prev) => ({ ...prev, ...cacheUpdate }));
        }

        const { files } = await refreshWorkingStatus(path, path);
        return { workingFiles: files, details };
      } catch (err) {
        if (showLoadingIndicator) showToast(String(err));
        return { workingFiles: [], details: null };
      } finally {
        if (showLoadingIndicator) setLoading(false);
      }
    },
    [refreshWorkingStatus, showToast]
  );

  const switchRepo = useCallback(
    async (
      path: string
    ): Promise<{ workingFiles: StatusFile[]; fromCache: boolean }> => {
      if (!path || path === activeRepoPath)
        return { workingFiles: [], fromCache: false };

      setActiveRepoPath(path);
      localStorage.setItem(STORAGE_KEYS.ACTIVE_REPO_PATH, path);

      const cachedDetails = repoCache[path];
      if (cachedDetails) {
        setRepoDetails(cachedDetails);
        const cachedWorking = workingCache[path] ?? [];
        loadRepo(path, false, false);
        return { workingFiles: cachedWorking, fromCache: true };
      } else {
        const { workingFiles } = await loadRepo(path, true, false);
        return { workingFiles, fromCache: false };
      }
    },
    [activeRepoPath, repoCache, workingCache, loadRepo]
  );

  const handleOpenFolder = useCallback(async () => {
    try {
      const paths = await invoke<string[]>("open_folder_dialog");
      if (paths?.length > 0) {
        let addedCount = 0;
        let nextRepos = [...repos];
        for (const p of paths) {
          if (!nextRepos.some((r) => r.path === p)) {
            const parts = p.split(/[/\\]/).filter(Boolean);
            nextRepos.push({
              id: p,
              name: parts[parts.length - 1] || "repository",
              path: p,
              branch: "HEAD",
            });
            addedCount++;
          }
        }
        if (addedCount > 0) saveRepos(nextRepos);
        await loadRepo(paths[0]);
        if (paths.length === 1) {
          const parts = paths[0].split(/[/\\]/).filter(Boolean);
          const name = parts[parts.length - 1] || "repository";
          showToast(addedCount > 0 ? `已添加仓库: ${name}` : `已切换至: ${name}`);
        } else {
          showToast(`已识别并添加 ${paths.length} 个 Git 仓库`);
        }
      }
    } catch (err) {
      showToast("打开仓库失败: " + String(err));
    }
  }, [repos, saveRepos, loadRepo, showToast]);

  const handleCloseRepo = useCallback(
    async (path: string): Promise<string> => {
      const remaining = repos.filter((r) => r.path !== path);
      saveRepos(remaining);
      if (path === activeRepoPath) {
        if (remaining.length > 0) {
          await loadRepo(remaining[0].path);
          return remaining[0].path;
        } else {
          setActiveRepoPath("");
          setRepoDetails(null);
          localStorage.removeItem(STORAGE_KEYS.ACTIVE_REPO_PATH);
          return "";
        }
      }
      return activeRepoPath;
    },
    [repos, activeRepoPath, saveRepos, loadRepo]
  );

  return {
    repos,
    activeRepoPath,
    repoDetails,
    loading,
    filesCache,
    setFilesCache,
    repoCache,
    workingCache,
    setRepoDetails,
    loadRepo,
    switchRepo,
    refreshWorkingStatus,
    handleOpenFolder,
    handleCloseRepo,
    saveRepos,
  };
}
