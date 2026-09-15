import { useState, useEffect, useMemo, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  FolderGit2,
  Folder,
  FolderPlus,
  Sun,
  Moon,
  ChevronDown,
  GitBranch,
  Globe,
  Copy,
  Check,
  RefreshCw,
  X,
  ChevronUp,
  Tag,
  GitCommit,
  GitMerge,
  UploadCloud,
  CheckSquare,
  Square,
} from "lucide-react";
import { FileTreeView } from "./components/FileTreeView";
import { GitGraphOverlay, computeGitGraph } from "./components/GitGraphView";
import { DiffViewer } from "./components/DiffViewer";
import { FileIcon } from "./components/FileIcon";
import "./App.css";

interface RepoInfo {
  id: string;
  name: string;
  path: string;
  branch: string;
}

interface ChangedFile {
  name: string;
  file_type: string;
  additions: number;
  deletions: number;
}

interface RefTag {
  name: string;
  is_head: boolean;
  is_tag: boolean;
}

interface CommitItem {
  sha: string;
  full_sha: string;
  msg: string;
  author: string;
  author_email: string;
  date: string;
  parent_shas: string[];
  ref_tags: RefTag[];
  files: ChangedFile[];
  graph_col: number;
}

interface BranchItem {
  name: string;
  is_head: boolean;
  is_remote: boolean;
}

interface RepoDetails {
  repo: RepoInfo;
  local_branches: BranchItem[];
  remote_branches: BranchItem[];
  commits: CommitItem[];
}

interface StatusFile {
  path: string;
  status: string;
  staged: boolean;
}

interface ContextMenuState {
  visible: boolean;
  x: number;
  y: number;
  branchName: string;
  isHead: boolean;
  isRemote: boolean;
}

interface MergeModalState {
  visible: boolean;
  sourceBranch: string;
  targetBranch: string;
  isSquash: boolean;
  commitMsg: string;
}

export default function App() {
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    return (localStorage.getItem("git_client_theme") as "light" | "dark") || "light";
  });

  const [repos, setRepos] = useState<RepoInfo[]>(() => {
    try {
      const saved = localStorage.getItem("git_client_manual_repos");
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [activeRepoPath, setActiveRepoPath] = useState<string>(() => {
    return localStorage.getItem("git_client_active_repo_path") || "";
  });

  const [repoDetails, setRepoDetails] = useState<RepoDetails | null>(null);
  const [selectedSha, setSelectedSha] = useState<string>("");
  const [filesCache, setFilesCache] = useState<Record<string, ChangedFile[]>>({});
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // 工作区变更状态
  const [workingChangesOpen, setWorkingChangesOpen] = useState(true);
  const [workingFiles, setWorkingFiles] = useState<StatusFile[]>([]);
  const [selectedWorkingFiles, setSelectedWorkingFiles] = useState<string[]>([]);
  const [commitMessage, setCommitMessage] = useState("");
  const [isCommitting, setIsCommitting] = useState(false);
  const [isPushing, setIsPushing] = useState(false);
  const [activeWorkingDiff, setActiveWorkingDiff] = useState<{
    path: string;
    diffText: string;
  } | null>(null);
  const [isWorkingDiffMaximized, setIsWorkingDiffMaximized] = useState(false);

  // 分支右键上下文菜单与合并弹窗
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [mergeModal, setMergeModal] = useState<MergeModalState | null>(null);

  // 分支过滤状态：null 表示展示全部分支大图，字符串表示仅看该分支
  const [filterBranch, setFilterBranch] = useState<string | null>(null);

  // 手风琴与折叠状态
  const [localBranchesOpen, setLocalBranchesOpen] = useState(true);
  const [remoteBranchesOpen, setRemoteBranchesOpen] = useState(false);
  const [detailsCollapsed, setDetailsCollapsed] = useState(true);
  const [collapsedBranchFolders, setCollapsedBranchFolders] = useState<Record<string, boolean>>({});

  // 多仓库内存数据缓存 (消除多标签切换卡顿)
  const [repoCache, setRepoCache] = useState<Record<string, RepoDetails>>({});
  const [workingCache, setWorkingCache] = useState<Record<string, StatusFile[]>>({});

  const refreshWorkingStatus = useCallback(async (path?: string) => {
    const targetPath = path || activeRepoPath;
    if (!targetPath) {
      setWorkingFiles([]);
      setSelectedWorkingFiles([]);
      return;
    }
    try {
      const files = await invoke<StatusFile[]>("get_working_status", { repoPath: targetPath });
      setWorkingCache((prev) => ({ ...prev, [targetPath]: files }));
      // 快速切换仓库时，旧仓库的后台请求不能覆盖当前仓库的工作区面板
      const currentPath = localStorage.getItem("git_client_active_repo_path") || activeRepoPath;
      if (currentPath === targetPath) {
        setWorkingFiles(files);
        setSelectedWorkingFiles(files.map((f) => f.path));
      }
    } catch {
      setWorkingFiles([]);
      setSelectedWorkingFiles([]);
    }
  }, [activeRepoPath]);

  const applyBranchFilter = async (branchName: string | null) => {
    if (!activeRepoPath) return;
    setFilterBranch(branchName);
    try {
      const commits = await invoke<CommitItem[]>("get_commits", {
        repoPath: activeRepoPath,
        branch: branchName || null,
      });
      setRepoDetails((prev) => (prev ? { ...prev, commits } : prev));
      setSelectedSha("");
      setDetailsCollapsed(true);
    } catch (err) {
      showToast("过滤分支历史失败: " + String(err));
      setFilterBranch(null);
    }
  };

  const handleBranchClick = (branchName: string) => {
    // 若当前已显示该分支历史，再次点击保持显示，只能通过点击右侧的叉号按钮关闭
    if (filterBranch === branchName) {
      return;
    }
    applyBranchFilter(branchName);
  };

  useEffect(() => {
    const handleGlobalClick = () => {
      if (contextMenu) setContextMenu(null);
    };
    window.addEventListener("click", handleGlobalClick);
    return () => window.removeEventListener("click", handleGlobalClick);
  }, [contextMenu]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (contextMenu) setContextMenu(null);
        if (mergeModal) setMergeModal(null);
        if (activeWorkingDiff) {
          setActiveWorkingDiff(null);
          setIsWorkingDiffMaximized(false);
        }
        if (filterBranch) applyBranchFilter(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [contextMenu, mergeModal, activeWorkingDiff, filterBranch, activeRepoPath]);

  const toggleBranchFolder = (folderName: string) => {
    setCollapsedBranchFolders((prev) => ({
      ...prev,
      [folderName]: !prev[folderName],
    }));
  };

  // 面板拖拽拉伸与停靠位置
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem("git_client_sidebar_width");
    return saved ? Math.max(170, Math.min(480, parseInt(saved, 10))) : 230;
  });

  const [dockPosition, setDockPosition] = useState<"bottom" | "right">(() => {
    return (localStorage.getItem("git_client_details_dock") as "bottom" | "right") || "bottom";
  });

  const [detailsHeight, setDetailsHeight] = useState(() => {
    const saved = localStorage.getItem("git_client_details_height");
    return saved ? Math.max(130, Math.min(600, parseInt(saved, 10))) : 240;
  });

  const [detailsWidth, setDetailsWidth] = useState(() => {
    const saved = localStorage.getItem("git_client_details_width");
    return saved ? Math.max(260, Math.min(650, parseInt(saved, 10))) : 380;
  });

  const [isResizingSidebar, setIsResizingSidebar] = useState(false);
  const [isResizingDetails, setIsResizingDetails] = useState(false);

  const toggleDockPosition = (e: React.MouseEvent) => {
    e.stopPropagation();
    const next = dockPosition === "bottom" ? "right" : "bottom";
    setDockPosition(next);
    localStorage.setItem("git_client_details_dock", next);
    setDetailsCollapsed(false);
  };

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 2400);
  };

  const saveRepos = (newRepos: RepoInfo[]) => {
    setRepos(newRepos);
    localStorage.setItem("git_client_manual_repos", JSON.stringify(newRepos));
  };

  const loadRepo = useCallback(async (
    path: string,
    showLoadingIndicator = true,
    activate = true,
  ) => {
    if (!path) return;

    if (activate) {
      setActiveRepoPath(path);
      localStorage.setItem("git_client_active_repo_path", path);
      setSelectedSha("");
      setFilterBranch(null);
      setDetailsCollapsed(true);
    }

    if (showLoadingIndicator) {
      setLoading(true);
    }
    try {
      const details = await invoke<RepoDetails>("load_repository", { repoPath: path });

      // 更新内存多仓库缓存
      setRepoCache((prev) => ({ ...prev, [path]: details }));

      // 仅当请求对应的仓库仍处于激活状态时更新当前视图，避免异步响应串仓
      const currentActive = localStorage.getItem("git_client_active_repo_path");
      if (currentActive === path) {
        setRepoDetails(details);
      }

      setRepos((prev) => {
        const updated = prev.map((r) =>
          r.path === path ? { ...r, branch: details.repo.branch } : r
        );
        localStorage.setItem("git_client_manual_repos", JSON.stringify(updated));
        return updated;
      });

      if (details.commits && details.commits.length > 0) {
        const cacheUpdate: Record<string, ChangedFile[]> = {};
        for (const c of details.commits) {
          if (c.files && c.files.length > 0) {
            cacheUpdate[c.sha] = c.files;
          }
        }
        setFilesCache((prev) => ({ ...prev, ...cacheUpdate }));
      }

      await refreshWorkingStatus(path);
    } catch (err) {
      if (showLoadingIndicator) {
        showToast(String(err));
      }
    } finally {
      if (showLoadingIndicator) {
        setLoading(false);
      }
    }
  }, [refreshWorkingStatus]);

  // 0 毫秒秒切仓库标签页：乐观高亮 + 内存缓存直出 + 后台静默校验
  const switchRepo = useCallback((path: string) => {
    if (!path || path === activeRepoPath) return;

    // 1. 同步瞬间激活目标标签页高亮
    setActiveRepoPath(path);
    localStorage.setItem("git_client_active_repo_path", path);
    setSelectedSha("");
    setFilterBranch(null);
    setDetailsCollapsed(true);

    // 2. 内存命中：0ms 瞬间展示缓存的分支与提交历史，无卡顿
    const cachedDetails = repoCache[path];
    if (cachedDetails) {
      setRepoDetails(cachedDetails);
      const cachedWorking = workingCache[path];
      if (cachedWorking) {
        setWorkingFiles(cachedWorking);
        setSelectedWorkingFiles(cachedWorking.map((f) => f.path));
      }
      // 后台静默校验
      loadRepo(path, false);
    } else {
      // 首次加载未缓存：展示加载指示器
      loadRepo(path, true);
    }
  }, [activeRepoPath, repoCache, workingCache, loadRepo]);

  useEffect(() => {
    if (repos.length > 0) {
      const target = repos.find((r) => r.path === activeRepoPath) || repos[0];
      if (target) {
        loadRepo(target.path);
      }
    } else {
      setRepoDetails(null);
      setActiveRepoPath("");
    }
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("git_client_theme", theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === "light" ? "dark" : "light"));
  };

  const handleOpenFolder = async () => {
    try {
      const paths = await invoke<string[]>("open_folder_dialog");
      if (paths && paths.length > 0) {
        let addedCount = 0;
        let nextRepos = [...repos];
        for (const p of paths) {
          const exists = nextRepos.some((r) => r.path === p);
          if (!exists) {
            const parts = p.split(/[/\\]/).filter(Boolean);
            const name = parts[parts.length - 1] || "repository";
            nextRepos.push({
              id: p,
              name,
              path: p,
              branch: "HEAD",
            });
            addedCount++;
          }
        }
        if (addedCount > 0) {
          saveRepos(nextRepos);
        }
        loadRepo(paths[0]);
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
  };

  const handleCloseRepo = (e: React.MouseEvent, path: string) => {
    e.stopPropagation();
    const remaining = repos.filter((r) => r.path !== path);
    saveRepos(remaining);
    if (path === activeRepoPath) {
      if (remaining.length > 0) {
        loadRepo(remaining[0].path);
      } else {
        setActiveRepoPath("");
        setRepoDetails(null);
        localStorage.removeItem("git_client_active_repo_path");
      }
    }
  };

  const handleCheckoutBranch = async (branchName: string) => {
    if (!activeRepoPath) return;

    // 1. 立即前端乐观更新 UI 上的 HEAD 指向，避免等待网络/磁盘 I/O
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
      // 2. 异步重新轻量同步最新状态与工作区
      loadRepo(activeRepoPath);
    } catch (err) {
      showToast(`切换失败: ${String(err)}`);
      // 失败时回退刷新
      loadRepo(activeRepoPath);
    }
  };

  const handleExecuteMerge = async () => {
    if (!mergeModal || !activeRepoPath) return;
    try {
      setLoading(true);
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
      loadRepo(activeRepoPath);
    } catch (err) {
      showToast(`合并失败: ${String(err)}`);
    } finally {
      setLoading(false);
    }
  };

  const handleCommitWorkingChanges = async () => {
    if (!activeRepoPath) return;
    if (!commitMessage.trim()) {
      showToast("请输入提交说明");
      return;
    }
    setIsCommitting(true);
    try {
      await invoke<string>("commit_working_changes", {
        repoPath: activeRepoPath,
        message: commitMessage,
        files: selectedWorkingFiles,
      });
      showToast("提交成功");
      setCommitMessage("");
      loadRepo(activeRepoPath);
      refreshWorkingStatus(activeRepoPath);
    } catch (err) {
      showToast(`提交失败: ${String(err)}`);
    } finally {
      setIsCommitting(false);
    }
  };

  const handlePushRemote = async () => {
    if (!activeRepoPath) return;
    setIsPushing(true);
    try {
      await invoke<string>("push_remote", {
        repoPath: activeRepoPath,
        remote: null,
        branch: null,
      });
      showToast("推送到远程成功");
      loadRepo(activeRepoPath);
    } catch (err) {
      showToast(`推送失败: ${String(err)}`);
    } finally {
      setIsPushing(false);
    }
  };

  const handleViewWorkingDiff = async (file: StatusFile) => {
    if (!activeRepoPath) return;
    try {
      const diff = await invoke<string>("get_working_diff", {
        repoPath: activeRepoPath,
        filePath: file.path,
        staged: file.staged,
      });
      setActiveWorkingDiff({
        path: file.path,
        diffText: diff,
      });
    } catch (err) {
      showToast(`获取文件差异失败: ${String(err)}`);
    }
  };

  const handleSelectCommit = async (sha: string) => {
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
  };

  const handleCopySha = (sha: string) => {
    navigator.clipboard.writeText(sha).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  const handleSidebarMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizingSidebar(true);
  };

  const handleDetailsMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizingDetails(true);
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isResizingSidebar) {
        const newWidth = Math.max(170, Math.min(480, e.clientX));
        setSidebarWidth(newWidth);
        localStorage.setItem("git_client_sidebar_width", String(newWidth));
      }
      if (isResizingDetails) {
        if (dockPosition === "bottom") {
          const winHeight = window.innerHeight;
          const newHeight = Math.max(120, Math.min(winHeight - 180, winHeight - e.clientY));
          setDetailsHeight(newHeight);
          localStorage.setItem("git_client_details_height", String(newHeight));
        } else {
          const winWidth = window.innerWidth;
          const newWidth = Math.max(260, Math.min(Math.min(650, winWidth - 320), winWidth - e.clientX));
          setDetailsWidth(newWidth);
          localStorage.setItem("git_client_details_width", String(newWidth));
        }
      }
    };

    const handleMouseUp = () => {
      setIsResizingSidebar(false);
      setIsResizingDetails(false);
    };

    if (isResizingSidebar || isResizingDetails) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
      document.body.style.userSelect = "none";
      document.body.style.cursor = isResizingSidebar
        ? "col-resize"
        : dockPosition === "bottom"
        ? "row-resize"
        : "col-resize";
    }

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    };
  }, [isResizingSidebar, isResizingDetails, dockPosition]);

  // 左侧分支按 / 层级自动归纳 (类似 IDEA 分支树)
  const groupedLocalBranches = useMemo(() => {
    if (!repoDetails) return { root: [], groups: [] };
    const root: BranchItem[] = [];
    const groupsMap = new Map<string, { branch: BranchItem; shortName: string }[]>();

    for (const b of repoDetails.local_branches) {
      if (b.name.includes("/")) {
        const parts = b.name.split("/");
        const folder = parts[0];
        const shortName = parts.slice(1).join("/");
        if (!groupsMap.has(folder)) {
          groupsMap.set(folder, []);
        }
        groupsMap.get(folder)!.push({ branch: b, shortName });
      } else {
        root.push(b);
      }
    }

    return {
      root,
      groups: Array.from(groupsMap.entries()).map(([folder, items]) => ({
        folder,
        items,
      })),
    };
  }, [repoDetails]);

  const currentCommit = useMemo(() => {
    if (!selectedSha || !repoDetails || !repoDetails.commits) return null;
    return repoDetails.commits.find((c) => c.sha === selectedSha) || null;
  }, [repoDetails, selectedSha]);

  const currentFiles = useMemo(() => {
    if (!currentCommit) return [];
    if (filesCache[currentCommit.sha]) {
      return filesCache[currentCommit.sha];
    }
    return currentCommit.files || [];
  }, [currentCommit, filesCache]);

  const diffStats = useMemo(() => {
    return currentFiles.reduce(
      (acc, f) => ({
        adds: acc.adds + f.additions,
        dels: acc.dels + f.deletions,
      }),
      { adds: 0, dels: 0 }
    );
  }, [currentFiles]);

  const { graphWidth } = useMemo(
    () => computeGitGraph(repoDetails?.commits || []),
    [repoDetails?.commits]
  );


  return (
    <div className="desktop-layout">
      {toastMessage && <div className="status-toast">{toastMessage}</div>}

      {/* 1. 顶部仓库切换栏 (无分支角标，横向空间平均分配) */}
      <header className="top-navbar">
        <div className="tabs-cluster">
          {repos.map((r) => {
            const isActive = r.path === activeRepoPath;
            return (
              <button
                key={r.path}
                className={`repo-tab ${isActive ? "active" : ""}`}
                onClick={() => switchRepo(r.path)}
                title={r.path}
              >
                {isActive ? (
                  <FolderGit2 className="tab-icon" size={14} />
                ) : (
                  <Folder className="tab-icon" size={14} />
                )}
                <span className="tab-title-text">{r.name}</span>
                <span
                  className="tab-close-icon"
                  onClick={(e) => handleCloseRepo(e, r.path)}
                  title="关闭该仓库"
                >
                  <X size={11} />
                </span>
              </button>
            );
          })}
        </div>

        <div className="top-actions">
          <button
            className="icon-action-btn"
            onClick={handleOpenFolder}
            title="打开本地 Git 仓库或工作区文件夹"
          >
            <FolderPlus size={14} />
          </button>

          {activeRepoPath && (
            <button
              className="icon-action-btn"
              onClick={handlePushRemote}
              disabled={isPushing}
              title="推送到远程仓库 (git push)"
            >
              <UploadCloud size={14} className={isPushing ? "spin-icon" : ""} />
            </button>
          )}

          {activeRepoPath && (
            <button
              className="icon-action-btn"
              onClick={() => {
                loadRepo(activeRepoPath);
                refreshWorkingStatus(activeRepoPath);
              }}
              title="刷新当前仓库与工作区状态"
            >
              <RefreshCw size={13} className={loading ? "spin-icon" : ""} />
            </button>
          )}

          <button
            className="icon-action-btn"
            onClick={toggleTheme}
            title={theme === "dark" ? "切换为浅色模式" : "切换为暗色模式"}
          >
            {theme === "dark" ? <Moon size={14} /> : <Sun size={14} />}
          </button>
        </div>
      </header>

      {/* 主工作区 */}
      {repos.length === 0 || !activeRepoPath ? (
        <div className="welcome-empty-container">
          <div className="welcome-icon-box">
            <FolderGit2 size={28} />
          </div>
          <h2 className="welcome-title">点墨 Inker</h2>
          <button className="welcome-action-btn" onClick={handleOpenFolder}>
            <FolderPlus size={16} />
            <span>选择本地仓库文件夹</span>
          </button>
        </div>
      ) : (
        <div className="workspace-body">
          {/* 2. 左侧统一侧边栏：工作区变更(置顶) + 本地分支 + 远程分支 纯手风琴体系 */}
          <aside
            className="branches-sidebar"
            style={{ width: `${sidebarWidth}px` }}
          >
            <div
              className={`sidebar-resizer ${isResizingSidebar ? "resizing" : ""}`}
              onMouseDown={handleSidebarMouseDown}
            />

            <div className="sidebar-scroll-zone">
              {/* 手风琴 1：工作区变更 */}
              <div className="accordion-section working-section">
                <div
                  className="accordion-header-btn"
                  onClick={() => setWorkingChangesOpen((v) => !v)}
                >
                  <div className="accordion-header-left">
                    <ChevronDown
                      size={12}
                      className={`accordion-chevron-icon ${workingChangesOpen ? "open" : ""}`}
                    />
                    <GitCommit size={13} className="accordion-section-icon" />
                    <span className="accordion-title">工作区变更</span>
                  </div>
                  <div className="accordion-header-right">
                    <span className={`accordion-count-badge ${workingFiles.length > 0 ? "has-changes" : ""}`}>
                      {workingFiles.length}
                    </span>
                  </div>
                </div>

                <div className={`accordion-collapse-wrapper ${workingChangesOpen ? "expanded" : "collapsed"}`}>
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
                            onClick={() => {
                              if (selectedWorkingFiles.length === workingFiles.length) {
                                setSelectedWorkingFiles([]);
                              } else {
                                setSelectedWorkingFiles(workingFiles.map((f) => f.path));
                              }
                            }}
                            title={selectedWorkingFiles.length === workingFiles.length ? "取消全选" : "全部选中"}
                          >
                            {selectedWorkingFiles.length === workingFiles.length && workingFiles.length > 0 ? (
                              <CheckSquare size={13} />
                            ) : (
                              <Square size={13} />
                            )}
                          </button>
                          <button
                            type="button"
                            className="changes-action-mini-btn"
                            onClick={() => refreshWorkingStatus()}
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
                                onClick={() => handleViewWorkingDiff(file)}
                                title={`点击比对差异: ${file.path}`}
                              >
                                <span
                                  className="changes-checkbox"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedWorkingFiles((prev) =>
                                      isChecked
                                        ? prev.filter((p) => p !== file.path)
                                        : [...prev, file.path]
                                    );
                                  }}
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
                                <span className={`changes-status-badge status-${file.status.toLowerCase()}`}>
                                  {file.status}
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
                          onChange={(e) => setCommitMessage(e.target.value)}
                          onKeyDown={(e) => {
                            if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                              e.preventDefault();
                              handleCommitWorkingChanges();
                            }
                          }}
                        />
                        <div className="changes-commit-actions">
                          <button
                            type="button"
                            className="changes-commit-btn primary"
                            disabled={isCommitting || workingFiles.length === 0}
                            onClick={handleCommitWorkingChanges}
                          >
                            <GitCommit size={13} />
                            <span>{isCommitting ? "提交中..." : `提交 (${selectedWorkingFiles.length})`}</span>
                          </button>
                          <button
                            type="button"
                            className="changes-commit-btn secondary"
                            disabled={isPushing}
                            onClick={handlePushRemote}
                            title="推送到远程 (git push)"
                          >
                            <UploadCloud size={13} className={isPushing ? "spin-icon" : ""} />
                            <span>{isPushing ? "推送中..." : "推送"}</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* 手风琴 2：本地分支 */}
              <div className="accordion-section local-section">
                <div
                  className="accordion-header-btn"
                  onClick={() => setLocalBranchesOpen((v) => !v)}
                >
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

                <div className={`accordion-collapse-wrapper ${localBranchesOpen ? "expanded" : "collapsed"}`}>
                  <div className="accordion-collapse-inner">
                    <div className="accordion-body">
                      {/* 顶层无斜杠分支 (例如 dev, main) */}
                      {groupedLocalBranches.root.map((b) => {
                        const isSelected = filterBranch === b.name;
                        return (
                          <div
                            key={b.name}
                            className={`tree-node-item ${isSelected ? "selected-filter" : ""}`}
                            onClick={() => handleBranchClick(b.name)}
                            onContextMenu={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setContextMenu({
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
                                  applyBranchFilter(null);
                                }}
                                title="关闭当前分支显示，恢复全部分支"
                              >
                                <X size={11} />
                              </button>
                            )}
                          </div>
                        );
                      })}

                      {/* 路径目录分组 (例如 📁 feature, 📁 bugfix, 📁 hotfix) */}
                      {groupedLocalBranches.groups.map((g) => {
                        const isFolderCollapsed = collapsedBranchFolders[g.folder];
                        return (
                          <div key={g.folder} className="branch-folder-box">
                            <button
                              className="branch-folder-header"
                              onClick={() => toggleBranchFolder(g.folder)}
                            >
                              <ChevronDown size={11} className={`folder-chevron-icon ${!isFolderCollapsed ? "open" : ""}`} style={{ color: "var(--ink-tertiary)" }} />
                              <Folder size={13} style={{ color: "var(--ink-secondary)" }} />
                              <span>{g.folder}</span>
                            </button>

                            <div className={`folder-collapse-wrapper ${!isFolderCollapsed ? "expanded" : "collapsed"}`}>
                              <div className="folder-collapse-inner">
                                <div className="branch-folder-items">
                                  {g.items.map(({ branch, shortName }) => {
                                    const isSelected = filterBranch === branch.name;
                                    return (
                                      <div
                                        key={branch.name}
                                        className={`tree-node-item ${isSelected ? "selected-filter" : ""}`}
                                        onClick={() => handleBranchClick(branch.name)}
                                        onContextMenu={(e) => {
                                          e.preventDefault();
                                          e.stopPropagation();
                                          setContextMenu({
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
                                        <span className="branch-name-text">{shortName}</span>
                                        {branch.is_head && <span className="head-tag-badge">HEAD</span>}
                                        {isSelected && (
                                          <button
                                            className="branch-clear-x"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              applyBranchFilter(null);
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
                        <div style={{ padding: "6px 8px", fontSize: "12px", color: "var(--ink-tertiary)" }}>
                          无本地分支
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* 手风琴 3：远程分支 */}
              <div className="accordion-section remote-section">
                <div
                  className="accordion-header-btn"
                  onClick={() => setRemoteBranchesOpen((v) => !v)}
                >
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

                <div className={`accordion-collapse-wrapper ${remoteBranchesOpen ? "expanded" : "collapsed"}`}>
                  <div className="accordion-collapse-inner">
                    <div className="accordion-body">
                      <div className="origin-head-row">
                        <Globe size={12} />
                        <span>origin</span>
                      </div>

                      <div className="origin-tree-guide">
                        {repoDetails?.remote_branches.map((b) => (
                          <div
                            key={b.name}
                            className="tree-node-item"
                            title={`远程分支 ${b.name}，右键更多操作`}
                            onContextMenu={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setContextMenu({
                                visible: true,
                                x: e.clientX,
                                y: e.clientY,
                                branchName: `origin/${b.name}`,
                                isHead: false,
                                isRemote: true,
                              });
                            }}
                          >
                            <GitBranch size={13} />
                            <span className="branch-name-text">{b.name}</span>
                          </div>
                        ))}
                        {(!repoDetails || repoDetails.remote_branches.length === 0) && (
                          <div style={{ padding: "4px 8px", fontSize: "12px", color: "var(--ink-tertiary)" }}>
                            无远程分支
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </aside>

          {/* 右侧内容工作区 (支持底部停靠与右侧停靠) */}
          <main className={`content-workspace dock-${dockPosition}`}>
            {/* Git Log 拓扑图与提交列表 (全量分支 --all 呈现) */}
            <section className="git-log-view">
              <div className="table-scroll-view">
                <div className="table-scroll-canvas">
                  {repoDetails && repoDetails.commits.length > 0 && (
                    <GitGraphOverlay
                      commits={repoDetails.commits}
                      selectedSha={selectedSha}
                    />
                  )}

                  <div className="commit-rows-stream">
                    {repoDetails?.commits.map((c) => {
                      const isRowActive = c.sha === selectedSha;
                      return (
                        <div
                          key={c.sha}
                          className={`commit-line-row ${isRowActive ? "active" : ""}`}
                          onClick={() => handleSelectCommit(c.sha)}
                        >
                          <div
                            style={{
                              width: `${graphWidth}px`,
                              flexShrink: 0,
                            }}
                          />

                          <div className="col-m-title">
                            <span>{c.msg}</span>
                          </div>

                          {/* 分支与版本标签独立列：统一位于提交人前 */}
                          <div className="col-r-tags">
                            {c.ref_tags && c.ref_tags.length > 0 && (
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
                                    title={tag.is_head ? `当前检出分支: ${tag.name}` : `分支: ${tag.name}`}
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

                          <div className="col-d-date">{c.date.split(" ")[1] || c.date}</div>
                        </div>
                      );
                    })}

                    {(!repoDetails || repoDetails.commits.length === 0) && (
                      <div className="empty-view-state">
                        <span>该仓库暂无提交记录</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </section>

            {/* 3. 提交详情区 (支持底部与右侧停靠，Chrome 控制台切换) */}
            <div
              className={`commit-details-drawer dock-${dockPosition} ${detailsCollapsed ? "collapsed" : "expanded"} ${isResizingDetails ? "is-resizing" : ""}`}
              style={
                dockPosition === "bottom"
                  ? { height: detailsCollapsed ? "36px" : `${detailsHeight}px` }
                  : { width: detailsCollapsed ? "36px" : `${detailsWidth}px` }
              }
            >
              {!detailsCollapsed && (
                <div
                  className={`details-resizer ${dockPosition === "bottom" ? "resizer-top" : "resizer-left"} ${isResizingDetails ? "resizing" : ""}`}
                  onMouseDown={handleDetailsMouseDown}
                />
              )}

              {/* 顶部简要信息栏 (点击可在展开/收起之间平滑切换) */}
              <div
                className="commit-details-collapsed-bar"
                onClick={() => setDetailsCollapsed((v) => !v)}
                title={detailsCollapsed ? "点击展开提交详情面板" : "点击收起提交详情面板"}
              >
                <div className="collapsed-bar-left">
                  <span className="collapsed-bar-title">
                    <ChevronUp
                      size={13}
                      className={`panel-chevron-icon ${
                        dockPosition === "bottom"
                          ? !detailsCollapsed ? "rotated" : ""
                          : !detailsCollapsed ? "rotated-right" : "rotated-left"
                      }`}
                    />
                    <span>提交详情</span>
                  </span>
                  {currentCommit && !detailsCollapsed && (
                    <>
                      <span className="sha-pill-badge" style={{ padding: "1px 6px", fontSize: "11px" }}>
                        {currentCommit.sha}
                      </span>
                      <span className="collapsed-bar-msg">
                        {currentCommit.msg}
                      </span>
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

                  {/* Chrome DevTools 风格停靠切换按钮 */}
                  <button
                    type="button"
                    className="panel-toggle-btn dock-switch-btn"
                    onClick={toggleDockPosition}
                    title={dockPosition === "bottom" ? "停靠到右侧 (Dock to right)" : "停靠到底部 (Dock to bottom)"}
                  >
                    {dockPosition === "bottom" ? (
                      /* Chrome 控制台：停靠到右侧图标 */
                      <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor">
                        <rect x="1.5" y="1.5" width="13" height="13" rx="2" fill="none" stroke="currentColor" strokeWidth="1.3"/>
                        <rect x="9.5" y="2.5" width="4" height="11" rx="1" fill="currentColor"/>
                      </svg>
                    ) : (
                      /* Chrome 控制台：停靠到底部图标 */
                      <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor">
                        <rect x="1.5" y="1.5" width="13" height="13" rx="2" fill="none" stroke="currentColor" strokeWidth="1.3"/>
                        <rect x="2.5" y="9.5" width="11" height="4" rx="1" fill="currentColor"/>
                      </svg>
                    )}
                  </button>

                  <button
                    className="panel-toggle-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDetailsCollapsed((v) => !v);
                    }}
                    title={detailsCollapsed ? "展开详情面板" : "收起详情面板"}
                  >
                    <ChevronUp
                      size={13}
                      className={`panel-toggle-icon ${
                        dockPosition === "bottom"
                          ? !detailsCollapsed ? "rotated" : ""
                          : !detailsCollapsed ? "rotated-right" : "rotated-left"
                      }`}
                    />
                  </button>
                </div>
              </div>

              {/* 展开后的详细信息视图 */}
              <div className="commit-details-body-scroller">
                {currentCommit ? (
                  <div className="commit-details-view-inner">
                    <div className="details-header-row">
                      <div className="commit-heading">
                        {currentCommit.msg}
                      </div>
                    </div>

                    <div className="commit-meta-cluster">
                      <button
                        className="sha-pill-badge"
                        onClick={() => handleCopySha(currentCommit.full_sha || currentCommit.sha)}
                        title="点击复制完整 SHA"
                      >
                        {copied ? <Check size={11} /> : <Copy size={11} />}
                        <span>{copied ? "COPIED" : currentCommit.sha}</span>
                      </button>

                      <div className="author-info-unit">
                        <span style={{ fontWeight: 600, color: "var(--ink)" }}>{currentCommit.author}</span>
                        {currentCommit.author_email && (
                          <span style={{ fontSize: "12px", color: "var(--ink-secondary)", fontFamily: "var(--font-mono)" }}>
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

                    <FileTreeView files={currentFiles} repoPath={activeRepoPath} commitSha={currentCommit?.sha} />

                    {currentFiles.length === 0 && (
                      <div style={{ color: "var(--ink-tertiary)", fontSize: "12px", padding: "8px 0" }}>
                        无文件变更或该提交为初始提交 / 合并空提交
                      </div>
                    )}
                  </div>
                ) : (
                  <div style={{ color: "var(--ink-tertiary)", fontSize: "13px", padding: "24px 20px" }}>
                    请在上方选择一条提交记录以查看文件变更
                  </div>
                )}
              </div>
            </div>
          </main>
        </div>
      )}

      {/* 分支右键上下文菜单 */}
      {contextMenu && (
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
                ? contextMenu.branchName.replace(/^origin\//, "")
                : contextMenu.branchName;
              handleCheckoutBranch(target);
              setContextMenu(null);
            }}
          >
            <GitBranch size={13} />
            <span>{contextMenu.isRemote ? "检出为本地分支" : "检出并切换至此分支"}</span>
          </button>
          <button
            type="button"
            className="context-menu-item"
            disabled={contextMenu.isHead}
            onClick={() => {
              const cur = repoDetails?.repo.branch || "HEAD";
              setMergeModal({
                visible: true,
                sourceBranch: contextMenu.branchName,
                targetBranch: cur,
                isSquash: false,
                commitMsg: `Merge branch '${contextMenu.branchName}' into ${cur}`,
              });
              setContextMenu(null);
            }}
          >
            <GitMerge size={13} />
            <span>合并到当前分支 ({repoDetails?.repo.branch})</span>
          </button>
          <button
            type="button"
            className="context-menu-item"
            disabled={contextMenu.isHead}
            onClick={() => {
              const cur = repoDetails?.repo.branch || "HEAD";
              setMergeModal({
                visible: true,
                sourceBranch: contextMenu.branchName,
                targetBranch: cur,
                isSquash: true,
                commitMsg: `Squash merge branch '${contextMenu.branchName}'`,
              });
              setContextMenu(null);
            }}
          >
            <GitCommit size={13} />
            <span>Squash 合并到当前分支...</span>
          </button>
        </div>
      )}

      {/* 合并分支确认弹窗 */}
      {mergeModal && (
        <div className="modal-overlay" onClick={() => setMergeModal(null)}>
          <div
            className="modal-dialog merge-modal-dialog"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <div className="modal-title">
                <GitMerge size={16} />
                <span>{mergeModal.isSquash ? "Squash 合并分支" : "合并分支"}</span>
              </div>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setMergeModal(null)}
              >
                <X size={14} />
              </button>
            </div>
            <div className="modal-body">
              <div className="merge-info-card">
                <div className="merge-direction">
                  <span className="merge-branch-tag source">{mergeModal.sourceBranch}</span>
                  <span className="merge-arrow">➔</span>
                  <span className="merge-branch-tag target">{mergeModal.targetBranch} (当前分支)</span>
                </div>
                <p className="merge-description">
                  {mergeModal.isSquash
                    ? "Squash 合并将来源分支的所有提交压缩为当前分支上的单次合并提交，保持主干历史整洁。"
                    : "普通合并保留完整的来源分支历史记录，并通过单独的 Merge Commit 合并入当前分支。"}
                </p>
              </div>

              <div className="form-field-group">
                <label className="form-label">合并提交说明 (Commit Message)</label>
                <textarea
                  className="form-textarea"
                  rows={3}
                  value={mergeModal.commitMsg}
                  onChange={(e) =>
                    setMergeModal((prev) =>
                      prev ? { ...prev, commitMsg: e.target.value } : null
                    )
                  }
                />
              </div>
            </div>
            <div className="modal-footer">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setMergeModal(null)}
              >
                取消
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={handleExecuteMerge}
                disabled={loading}
              >
                {loading ? "正在合并..." : "确认合并"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 工作区文件差异对比大窗口 */}
      {activeWorkingDiff && (
        <div
          className="diff-modal-overlay"
          onClick={() => {
            setActiveWorkingDiff(null);
            setIsWorkingDiffMaximized(false);
          }}
        >
          <div
            className={`diff-modal-window ${isWorkingDiffMaximized ? "is-maximized" : ""}`}
            onClick={(e) => e.stopPropagation()}
          >
            <DiffViewer
              diffText={activeWorkingDiff.diffText}
              filePath={activeWorkingDiff.path}
              isExpandedModal={true}
              isMaximized={isWorkingDiffMaximized}
              onToggleMaximize={() => setIsWorkingDiffMaximized(!isWorkingDiffMaximized)}
              onCloseModal={() => {
                setActiveWorkingDiff(null);
                setIsWorkingDiffMaximized(false);
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
