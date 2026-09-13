import { useState, useEffect, useMemo, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  FolderGit2,
  Folder,
  FolderPlus,
  Sun,
  Moon,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  GitBranch,
  Globe,
  Copy,
  Check,
  RefreshCw,
  X,
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

interface CommitItem {
  sha: string;
  full_sha: string;
  msg: string;
  prefix: string;
  author: string;
  author_email: string;
  date: string;
  parent_shas: string[];
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

  // 1. 用户手动添加的仓库列表
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

  // 2. 选中提交：绝不默认选中任何提交
  const [selectedSha, setSelectedSha] = useState<string>("");
  const [filesCache, setFilesCache] = useState<Record<string, ChangedFile[]>>({});
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // 3. 手风琴状态：本地分支默认展开，远程分支默认折叠且位于最底部
  const [localBranchesOpen, setLocalBranchesOpen] = useState(true);
  const [remoteBranchesOpen, setRemoteBranchesOpen] = useState(false);

  // 底部详情折叠状态：默认收起
  const [detailsCollapsed, setDetailsCollapsed] = useState(true);

  // 4. 面板尺寸拖拽状态与持久化
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

  // 加载仓库
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

      // 绝不默认选中提交，清空当前选中项并默认收起详情
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

  // 启动初始化加载
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

  // 主题切换
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("git_client_theme", theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === "light" ? "dark" : "light"));
  };

  // 打开文件夹弹窗
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

  // 关闭仓库标签
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

  // 切换分支
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

  // 选中提交
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

  // 复制 SHA
  const handleCopySha = (sha: string) => {
    navigator.clipboard.writeText(sha).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  // 拖拽调整侧边栏宽度
  const handleSidebarMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizingSidebar(true);
  };

  // 拖拽调整底部详情栏高度
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

      {/* 1. 顶部仓库切换栏 (彻底去掉分支标签) */}
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
                <span>{r.name}</span>
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

          <button
            className="add-repo-btn"
            onClick={handleOpenFolder}
            title="手动选择并添加本地 Git 仓库"
          >
            <FolderPlus size={14} />
          </button>
        </div>

        <div className="top-actions">
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
            className="theme-switch-btn"
            onClick={toggleTheme}
            title="切换明暗模式"
          >
            {theme === "dark" ? <Moon size={13} /> : <Sun size={13} />}
            <span>{theme === "dark" ? "暗色" : "浅色"}</span>
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
          {/* 2. 左侧分支侧边栏 (支持手风琴折叠与水平拖拽调整) */}
          <aside
            className="branches-sidebar"
            style={{ width: `${sidebarWidth}px` }}
          >
            {/* 侧边栏垂直拖拽把手 */}
            <div
              className={`sidebar-resizer ${isResizingSidebar ? "resizing" : ""}`}
              onMouseDown={handleSidebarMouseDown}
            />

            {/* 本地分支手风琴 (默认展开) */}
            <div className="accordion-section local-section">
              <button
                className="accordion-header-btn"
                onClick={() => setLocalBranchesOpen((v) => !v)}
              >
                <span>本地分支</span>
                {localBranchesOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              </button>

              {localBranchesOpen && (
                <div className="accordion-body">
                  {repoDetails?.local_branches.map((b) => {
                    const isActive = b.name === (repoDetails.local_branches.find((x) => x.is_head)?.name || "main");
                    return (
                      <button
                        key={b.name}
                        className={`tree-node-item ${isActive ? "active" : ""}`}
                        onClick={() => handleCheckoutBranch(b.name)}
                        title={`点击检出分支 ${b.name}`}
                      >
                        {isActive ? (
                          <span className="active-point-dot" />
                        ) : (
                          <GitBranch size={13} />
                        )}
                        <span>{b.name}</span>
                        {b.is_head && <span className="head-tag-badge">HEAD</span>}
                      </button>
                    );
                  })}

                  {(!repoDetails || repoDetails.local_branches.length === 0) && (
                    <div style={{ padding: "6px 8px", fontSize: "12px", color: "var(--ink-tertiary)" }}>
                      无本地分支
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* 远程分支手风琴 (置底吸附，默认折叠) */}
            <div className="accordion-section remote-section">
              <button
                className="accordion-header-btn"
                onClick={() => setRemoteBranchesOpen((v) => !v)}
              >
                <span>远程分支</span>
                {remoteBranchesOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              </button>

              {remoteBranchesOpen && (
                <div className="accordion-body">
                  <div className="origin-head-row">
                    <Globe size={12} />
                    <span>origin</span>
                  </div>

                  <div className="origin-tree-guide">
                    {repoDetails?.remote_branches.map((b) => (
                      <div key={b.name} className="tree-node-item" title={b.name}>
                        <GitBranch size={13} />
                        <span>{b.name}</span>
                      </div>
                    ))}
                    {(!repoDetails || repoDetails.remote_branches.length === 0) && (
                      <div style={{ padding: "4px 8px", fontSize: "12px", color: "var(--ink-tertiary)" }}>
                        无远程分支
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </aside>

          {/* 右侧内容工作区 */}
          <main className="content-workspace">
            {/* Git Log 拓扑图与提交列表 */}
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
                          {/* 动态适配拓扑图轨道的占位宽度 */}
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

            {/* 3. 底部提交详情区 (支持折叠与展开，默认折叠) */}
            {detailsCollapsed ? (
              <div
                className="commit-details-collapsed-bar"
                onClick={() => setDetailsCollapsed(false)}
                title="点击展开提交详情面板"
              >
                <div className="collapsed-bar-left">
                  <span className="collapsed-bar-title">
                    <ChevronUp size={13} />
                    <span>提交详情</span>
                  </span>
                  {currentCommit ? (
                    <>
                      <span className="sha-pill-badge" style={{ padding: "1px 6px", fontSize: "11px" }}>
                        {currentCommit.sha}
                      </span>
                      <span>
                        {currentCommit.prefix ? `${currentCommit.prefix} ` : ""}
                        {currentCommit.msg}
                      </span>
                    </>
                  ) : (
                    <span style={{ color: "var(--ink-tertiary)" }}>未选择提交（点击展开）</span>
                  )}
                </div>

                <div className="collapsed-bar-right">
                  {currentCommit && currentFiles.length > 0 && (
                    <div className="diff-tags-cluster">
                      <span className="diff-watercolor-tag add">+{diffStats.adds}</span>
                      <span className="diff-watercolor-tag del">-{diffStats.dels}</span>
                    </div>
                  )}
                  <button
                    className="panel-toggle-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDetailsCollapsed(false);
                    }}
                    title="展开详情面板"
                  >
                    <ChevronUp size={13} />
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div
                  className={`details-resizer ${isResizingDetails ? "resizing" : ""}`}
                  onMouseDown={handleDetailsMouseDown}
                />

                <section
                  className="commit-details-view"
                  style={{ height: `${detailsHeight}px` }}
                >
                  <div className="details-header-row">
                    <div className="commit-heading">
                      {currentCommit
                        ? `${currentCommit.prefix ? currentCommit.prefix + " " : ""}${currentCommit.msg}`
                        : "提交详情"}
                    </div>
                    <button
                      className="panel-toggle-btn"
                      onClick={() => setDetailsCollapsed(true)}
                      title="收起提交详情"
                    >
                      <ChevronDown size={13} />
                    </button>
                  </div>

                  {currentCommit ? (
                    <>
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

                      <FileTreeView files={currentFiles} />

                      {currentFiles.length === 0 && (
                        <div style={{ color: "var(--ink-tertiary)", fontSize: "12px", padding: "8px 0" }}>
                          无文件变更或该提交为初始提交 / 合并空提交
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="empty-view-state">
                      <span style={{ color: "var(--ink-tertiary)" }}>未选择任何提交记录（点击上方列表查看详细 Diff 与文件树）</span>
                    </div>
                  )}
                </section>
              </>
            )}
          </main>
        </div>
      )}
    </div>
  );
}
