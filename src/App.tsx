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
} from "lucide-react";
import { FileTreeView } from "./components/FileTreeView";
import { GitGraphOverlay, computeGitGraph } from "./components/GitGraphView";
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
  prefix: string;
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

function getPrefixClass(prefix: string) {
  const p = prefix.toLowerCase();
  if (p.startsWith("fix")) return "flag-fix";
  if (p.startsWith("feat")) return "flag-feat";
  if (p.startsWith("merge")) return "flag-merge";
  if (p.startsWith("chore")) return "flag-chore";
  return "";
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

  // 分支过滤状态：null 表示展示全部分支大图，字符串表示仅看该分支
  const [filterBranch, setFilterBranch] = useState<string | null>(null);

  // 手风琴与折叠状态
  const [localBranchesOpen, setLocalBranchesOpen] = useState(true);
  const [remoteBranchesOpen, setRemoteBranchesOpen] = useState(false);
  const [detailsCollapsed, setDetailsCollapsed] = useState(true);
  const [collapsedBranchFolders, setCollapsedBranchFolders] = useState<Record<string, boolean>>({});

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
    if (filterBranch === branchName) {
      applyBranchFilter(null);
    } else {
      applyBranchFilter(branchName);
    }
  };

  const handleBranchDoubleClick = (branchName: string) => {
    handleCheckoutBranch(branchName);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && filterBranch) {
        applyBranchFilter(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [filterBranch, activeRepoPath]);

  const toggleBranchFolder = (folderName: string) => {
    setCollapsedBranchFolders((prev) => ({
      ...prev,
      [folderName]: !prev[folderName],
    }));
  };

  // 面板拖拽拉伸
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem("git_client_sidebar_width");
    return saved ? Math.max(170, Math.min(480, parseInt(saved, 10))) : 230;
  });

  const [detailsHeight, setDetailsHeight] = useState(() => {
    const saved = localStorage.getItem("git_client_details_height");
    return saved ? Math.max(130, Math.min(600, parseInt(saved, 10))) : 240;
  });

  const [isResizingSidebar, setIsResizingSidebar] = useState(false);
  const [isResizingDetails, setIsResizingDetails] = useState(false);

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

  const loadRepo = useCallback(async (path: string) => {
    if (!path) return;
    setLoading(true);
    try {
      const details = await invoke<RepoDetails>("load_repository", { repoPath: path });
      setRepoDetails(details);
      setActiveRepoPath(path);
      localStorage.setItem("git_client_active_repo_path", path);

      setRepos((prev) => {
        const updated = prev.map((r) =>
          r.path === path ? { ...r, branch: details.repo.branch } : r
        );
        localStorage.setItem("git_client_manual_repos", JSON.stringify(updated));
        return updated;
      });

      setSelectedSha("");
      setDetailsCollapsed(true);

      if (details.commits && details.commits.length > 0) {
        const cacheUpdate: Record<string, ChangedFile[]> = {};
        for (const c of details.commits) {
          if (c.files && c.files.length > 0) {
            cacheUpdate[c.sha] = c.files;
          }
        }
        setFilesCache((prev) => ({ ...prev, ...cacheUpdate }));
      }
    } catch (err) {
      showToast(String(err));
    } finally {
      setLoading(false);
    }
  }, []);

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
      const selectedPath = await invoke<string | null>("open_folder_dialog");
      if (selectedPath) {
        const existing = repos.find((r) => r.path === selectedPath);
        if (existing) {
          loadRepo(selectedPath);
          showToast(`已切换至: ${existing.name}`);
        } else {
          const parts = selectedPath.split("/").filter(Boolean);
          const name = parts[parts.length - 1] || "repository";
          const newRepo: RepoInfo = {
            id: selectedPath,
            name,
            path: selectedPath,
            branch: "HEAD",
          };
          const newRepos = [...repos, newRepo];
          saveRepos(newRepos);
          loadRepo(selectedPath);
          showToast(`已添加仓库: ${name}`);
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
    try {
      await invoke("checkout_branch", {
        repoPath: activeRepoPath,
        branchName,
      });
      showToast(`已检出分支: ${branchName}`);
      loadRepo(activeRepoPath);
    } catch (err) {
      showToast(`切换失败: ${String(err)}`);
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
        const winHeight = window.innerHeight;
        const newHeight = Math.max(120, Math.min(winHeight - 180, winHeight - e.clientY));
        setDetailsHeight(newHeight);
        localStorage.setItem("git_client_details_height", String(newHeight));
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
      document.body.style.cursor = isResizingSidebar ? "col-resize" : "row-resize";
    }

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    };
  }, [isResizingSidebar, isResizingDetails]);

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
                onClick={() => loadRepo(r.path)}
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
            title="打开本地 Git 仓库文件夹"
          >
            <FolderPlus size={14} />
          </button>

          {activeRepoPath && (
            <button
              className="icon-action-btn"
              onClick={() => loadRepo(activeRepoPath)}
              title="刷新当前仓库"
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
          <p className="welcome-subtitle">
            纯净、克制的 Git 桌面工作台。选择本地包含 .git 的项目文件夹即可开启管理
          </p>
          <button className="welcome-action-btn" onClick={handleOpenFolder}>
            <FolderPlus size={16} />
            <span>选择本地仓库文件夹</span>
          </button>
        </div>
      ) : (
        <div className="workspace-body">
          {/* 2. 左侧分支侧边栏 (IDEA 风格：路径文件夹折叠 + 底部吸附远程分支) */}
          <aside
            className="branches-sidebar"
            style={{ width: `${sidebarWidth}px` }}
          >
            <div
              className={`sidebar-resizer ${isResizingSidebar ? "resizing" : ""}`}
              onMouseDown={handleSidebarMouseDown}
            />

            <div className="sidebar-scroll-zone">
            {/* 本地分支手风琴 */}
            <div className="accordion-section local-section">
              <div
                className="accordion-header-btn"
                onClick={() => setLocalBranchesOpen((v) => !v)}
                style={{ cursor: "pointer" }}
              >
                <span>本地分支</span>
                <ChevronDown size={12} className={`accordion-chevron-icon ${localBranchesOpen ? "open" : ""}`} />
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
                        onDoubleClick={() => handleBranchDoubleClick(b.name)}
                        title={`单击聚焦查看 ${b.name}，双击检出切换`}
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
                            title="取消查看此分支，恢复全部"
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
                                  onDoubleClick={() => handleBranchDoubleClick(branch.name)}
                                  title={`单击聚焦查看 ${branch.name}，双击检出切换`}
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
                                      title="取消查看此分支，恢复全部"
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

            {/* 远程分支手风琴 (未展开时置底吸附，展开时紧随本地分支身后排列) */}
            <div
              className={`accordion-section remote-section ${
                remoteBranchesOpen ? "expanded-flow" : "collapsed-bottom"
              }`}
            >
              <button
                className="accordion-header-btn"
                onClick={() => setRemoteBranchesOpen((v) => !v)}
              >
                <span>远程分支</span>
                <ChevronDown size={12} className={`accordion-chevron-icon ${remoteBranchesOpen ? "open" : ""}`} />
              </button>

              <div className={`accordion-collapse-wrapper ${remoteBranchesOpen ? "expanded" : "collapsed"}`}>
                <div className="accordion-collapse-inner">
                  <div className="accordion-body">
                  <div className="origin-head-row">
                    <Globe size={12} />
                    <span>origin</span>
                  </div>

                  <div className="origin-tree-guide">
                    {repoDetails?.remote_branches.map((b) => (
                      <div key={b.name} className="tree-node-item" title={b.name}>
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

          {/* 右侧内容工作区 */}
          <main className="content-workspace">
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
                            {c.prefix && (
                              <span className={`prefix-flag ${getPrefixClass(c.prefix)}`}>
                                {c.prefix}
                              </span>
                            )}
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

            {/* 3. 底部提交详情区 (平滑高度与抽屉伸缩过渡动效) */}
            <div
              className={`commit-details-drawer ${detailsCollapsed ? "collapsed" : "expanded"} ${isResizingDetails ? "is-resizing" : ""}`}
              style={{ height: detailsCollapsed ? "36px" : `${detailsHeight}px` }}
            >
              {!detailsCollapsed && (
                <div
                  className={`details-resizer ${isResizingDetails ? "resizing" : ""}`}
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
                    <ChevronUp size={13} className={`panel-chevron-icon ${!detailsCollapsed ? "rotated" : ""}`} />
                    <span>提交详情</span>
                  </span>
                  {currentCommit && (
                    <>
                      <span className="sha-pill-badge" style={{ padding: "1px 6px", fontSize: "11px" }}>
                        {currentCommit.sha}
                      </span>
                      <span className="collapsed-bar-msg">
                        {currentCommit.prefix ? `${currentCommit.prefix} ` : ""}
                        {currentCommit.msg}
                      </span>
                    </>
                  )}
                </div>

                <div className="collapsed-bar-right">
                  {currentCommit && currentFiles.length > 0 && (
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
                    className="panel-toggle-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDetailsCollapsed((v) => !v);
                    }}
                    title={detailsCollapsed ? "展开详情面板" : "收起详情面板"}
                  >
                    <ChevronUp size={13} className={`panel-toggle-icon ${!detailsCollapsed ? "rotated" : ""}`} />
                  </button>
                </div>
              </div>

              {/* 展开后的详细信息视图 */}
              <div className="commit-details-body-scroller">
                {currentCommit ? (
                  <div className="commit-details-view-inner">
                    <div className="details-header-row">
                      <div className="commit-heading">
                        {currentCommit.prefix ? `${currentCommit.prefix} ` : ""}
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
    </div>
  );
}
