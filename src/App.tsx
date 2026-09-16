import { useState, useEffect, useMemo, useCallback } from "react";
import { FolderGit2, FolderPlus } from "lucide-react";

import { STORAGE_KEYS } from "./constants/storage";
import { useRepoManager } from "./hooks/useRepoManager";
import { useWorkingArea } from "./hooks/useWorkingArea";
import { useBranchActions } from "./hooks/useBranchActions";
import { useCommitLog } from "./hooks/useCommitLog";
import { useStash } from "./hooks/useStash";
import { computeGitGraph } from "./components/GitGraphView";

import { TopBar } from "./components/TopBar";
import { Sidebar } from "./components/Sidebar";
import { CommitList } from "./components/CommitList";
import { CommitDetail } from "./components/CommitDetail";
import { BranchContextMenu } from "./components/BranchContextMenu";
import { MergeModal } from "./components/MergeModal";
import { CreateBranchModal } from "./components/CreateBranchModal";
import { CloneModal } from "./components/CloneModal";
import { DiffViewer } from "./components/DiffViewer";

import type { MergeModalState, CreateBranchModalState } from "./types";
import "./App.css";

// ── Toast ────────────────────────────────────────────────────
function useToast() {
  const [message, setMessage] = useState<string | null>(null);
  const show = useCallback((msg: string) => {
    setMessage(msg);
    setTimeout(() => setMessage(null), 2400);
  }, []);
  return { message, show };
}

// ── 主题 ─────────────────────────────────────────────────────
function useTheme() {
  const [theme, setTheme] = useState<"light" | "dark">(
    () => (localStorage.getItem(STORAGE_KEYS.THEME) as "light" | "dark") || "light"
  );
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem(STORAGE_KEYS.THEME, theme);
  }, [theme]);
  const toggle = useCallback(
    () => setTheme((t) => (t === "light" ? "dark" : "light")),
    []
  );
  return { theme, toggle };
}

// ── 面板尺寸 ─────────────────────────────────────────────────
function usePanelLayout() {
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const s = localStorage.getItem(STORAGE_KEYS.SIDEBAR_WIDTH);
    return s ? Math.max(170, Math.min(480, parseInt(s, 10))) : 230;
  });
  const [dockPosition, setDockPosition] = useState<"bottom" | "right">(
    () =>
      (localStorage.getItem(STORAGE_KEYS.DETAILS_DOCK) as "bottom" | "right") || "bottom"
  );
  const [detailsHeight, setDetailsHeight] = useState(() => {
    const s = localStorage.getItem(STORAGE_KEYS.DETAILS_HEIGHT);
    return s ? Math.max(130, Math.min(600, parseInt(s, 10))) : 240;
  });
  const [detailsWidth, setDetailsWidth] = useState(() => {
    const s = localStorage.getItem(STORAGE_KEYS.DETAILS_WIDTH);
    return s ? Math.max(260, Math.min(650, parseInt(s, 10))) : 380;
  });
  const [isResizingSidebar, setIsResizingSidebar] = useState(false);
  const [isResizingDetails, setIsResizingDetails] = useState(false);

  const toggleDockPosition = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setDockPosition((prev) => {
      const next = prev === "bottom" ? "right" : "bottom";
      localStorage.setItem(STORAGE_KEYS.DETAILS_DOCK, next);
      return next;
    });
  }, []);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isResizingSidebar) {
        const w = Math.max(170, Math.min(480, e.clientX));
        setSidebarWidth(w);
        localStorage.setItem(STORAGE_KEYS.SIDEBAR_WIDTH, String(w));
      }
      if (isResizingDetails) {
        if (dockPosition === "bottom") {
          const newH = Math.max(120, Math.min(window.innerHeight - 180, window.innerHeight - e.clientY));
          setDetailsHeight(newH);
          localStorage.setItem(STORAGE_KEYS.DETAILS_HEIGHT, String(newH));
        } else {
          const newW = Math.max(260, Math.min(Math.min(650, window.innerWidth - 320), window.innerWidth - e.clientX));
          setDetailsWidth(newW);
          localStorage.setItem(STORAGE_KEYS.DETAILS_WIDTH, String(newW));
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
      document.body.style.cursor =
        isResizingSidebar ? "col-resize" : dockPosition === "bottom" ? "row-resize" : "col-resize";
    }
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    };
  }, [isResizingSidebar, isResizingDetails, dockPosition]);

  return {
    sidebarWidth,
    dockPosition,
    detailsHeight,
    detailsWidth,
    isResizingSidebar,
    isResizingDetails,
    toggleDockPosition,
    setIsResizingSidebar,
    setIsResizingDetails,
  };
}

// ── App ──────────────────────────────────────────────────────
export default function App() {
  const { message: toastMessage, show: showToast } = useToast();
  const { theme, toggle: toggleTheme } = useTheme();
  const layout = usePanelLayout();

  // 手风琴开合状态
  const [workingChangesOpen, setWorkingChangesOpen] = useState(true);
  const [localBranchesOpen, setLocalBranchesOpen] = useState(true);
  const [remoteBranchesOpen, setRemoteBranchesOpen] = useState(false);
  const [collapsedBranchFolders, setCollapsedBranchFolders] = useState<Record<string, boolean>>({});

  // Clone 弹窗
  const [showCloneModal, setShowCloneModal] = useState(false);

  // ── 仓库管理 ─────────────────────────────────────────────
  const repo = useRepoManager(showToast);

  // 刷新回调（提交/推送/合并后使用）
  const handleRefresh = useCallback(() => {
    if (repo.activeRepoPath) {
      repo.loadRepo(repo.activeRepoPath);
      repo.refreshWorkingStatus(repo.activeRepoPath);
    }
  }, [repo]);

  // ── 工作区 ───────────────────────────────────────────────
  const working = useWorkingArea(repo.activeRepoPath, showToast, handleRefresh);

  // 将仓库加载的工作区文件同步给 working hook
  useEffect(() => {
    if (repo.workingCache[repo.activeRepoPath]) {
      working.setWorkingFiles(repo.workingCache[repo.activeRepoPath]);
    }
  }, [repo.workingCache, repo.activeRepoPath]);

  // ── 分支操作 ─────────────────────────────────────────────
  const branch = useBranchActions(
    repo.activeRepoPath,
    repo.repoDetails,
    repo.setRepoDetails,
    showToast,
    handleRefresh
  );

  // ── Stash ────────────────────────────────────────────────
  const stash = useStash(repo.activeRepoPath, showToast, handleRefresh);

  // 切换仓库时刷新 stash 列表
  useEffect(() => {
    if (repo.activeRepoPath) stash.refreshStashes(repo.activeRepoPath);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repo.activeRepoPath]);

  // ── 提交日志 ─────────────────────────────────────────────
  const log = useCommitLog(
    repo.activeRepoPath,
    repo.repoDetails,
    repo.setRepoDetails,
    repo.filesCache,
    repo.setFilesCache,
    showToast
  );

  // 初始加载
  useEffect(() => {
    if (repo.repos.length > 0) {
      const target =
        repo.repos.find((r) => r.path === repo.activeRepoPath) || repo.repos[0];
      if (target) repo.loadRepo(target.path);
    } else {
      repo.setRepoDetails(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 全局键盘事件
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (branch.contextMenu) branch.setContextMenu(null);
        if (branch.mergeModal) branch.setMergeModal(null);
        if (branch.createBranchModal) branch.setCreateBranchModal(null);
        if (working.activeWorkingDiff) working.closeWorkingDiff();
        if (branch.filterBranch) branch.applyBranchFilter(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [branch, working]);

  // 点击空白关闭右键菜单
  useEffect(() => {
    const handler = () => { if (branch.contextMenu) branch.setContextMenu(null); };
    window.addEventListener("click", handler);
    return () => window.removeEventListener("click", handler);
  }, [branch.contextMenu]);

  // 切换仓库
  const handleSwitchRepo = useCallback(
    async (path: string) => {
      const { workingFiles } = await repo.switchRepo(path);
      working.setWorkingFiles(workingFiles);
      log.setSelectedSha("");
      log.setDetailsCollapsed(true);
      branch.setFilterBranch(null);
    },
    [repo, working, log, branch]
  );

  // 关闭仓库
  const handleCloseRepo = useCallback(
    async (e: React.MouseEvent, path: string) => {
      e.stopPropagation();
      await repo.handleCloseRepo(path);
    },
    [repo]
  );

  // 分支归组
  const groupedLocalBranches = useMemo(() => {
    if (!repo.repoDetails) return { root: [], groups: [] };
    const root: typeof repo.repoDetails.local_branches = [];
    const groupsMap = new Map<string, { branch: typeof repo.repoDetails.local_branches[0]; shortName: string }[]>();
    for (const b of repo.repoDetails.local_branches) {
      if (b.name.includes("/")) {
        const folder = b.name.split("/")[0];
        const shortName = b.name.split("/").slice(1).join("/");
        if (!groupsMap.has(folder)) groupsMap.set(folder, []);
        groupsMap.get(folder)!.push({ branch: b, shortName });
      } else {
        root.push(b);
      }
    }
    return {
      root,
      groups: Array.from(groupsMap.entries()).map(([folder, items]) => ({ folder, items })),
    };
  }, [repo.repoDetails]);

  const { graphWidth } = useMemo(
    () => computeGitGraph(repo.repoDetails?.commits || []),
    [repo.repoDetails?.commits]
  );

  const hasRepos = repo.repos.length > 0 && repo.activeRepoPath;

  return (
    <div className="desktop-layout">
      {toastMessage && <div className="status-toast">{toastMessage}</div>}

      <TopBar
        repos={repo.repos}
        activeRepoPath={repo.activeRepoPath}
        loading={repo.loading}
        isPushing={working.isPushing}
        isPulling={working.isPulling}
        isFetching={working.isFetching}
        theme={theme}
        onSwitchRepo={handleSwitchRepo}
        onCloseRepo={handleCloseRepo}
        onOpenFolder={repo.handleOpenFolder}
        onClone={() => setShowCloneModal(true)}
        onPush={working.handlePushRemote}
        onPull={working.handlePullRemote}
        onFetch={working.handleFetchRemote}
        onRefresh={handleRefresh}
        onToggleTheme={toggleTheme}
      />

      {!hasRepos ? (
        <div className="welcome-empty-container">
          <div className="welcome-icon-box">
            <FolderGit2 size={28} />
          </div>
          <h2 className="welcome-title">点墨 Inker</h2>
          <button className="welcome-action-btn" onClick={repo.handleOpenFolder}>
            <FolderPlus size={16} />
            <span>选择本地仓库文件夹</span>
          </button>
        </div>
      ) : (
        <div className="workspace-body">
          {/* 左侧侧边栏 */}
          <aside
            className="branches-sidebar"
            style={{ width: `${layout.sidebarWidth}px` }}
          >
            <div
              className={`sidebar-resizer ${layout.isResizingSidebar ? "resizing" : ""}`}
              onMouseDown={(e) => { e.preventDefault(); layout.setIsResizingSidebar(true); }}
            />
            <Sidebar
              repoDetails={repo.repoDetails}
              workingFiles={working.workingFiles}
              selectedWorkingFiles={working.selectedWorkingFiles}
              commitMessage={working.commitMessage}
              isCommitting={working.isCommitting}
              isPushing={working.isPushing}
              workingChangesOpen={workingChangesOpen}
              localBranchesOpen={localBranchesOpen}
              remoteBranchesOpen={remoteBranchesOpen}
              filterBranch={branch.filterBranch}
              collapsedBranchFolders={collapsedBranchFolders}
              groupedLocalBranches={groupedLocalBranches}
              stashes={stash.stashes}
              stashMessage={stash.stashMessage}
              isStashOpen={stash.isStashOpen}
              onToggleStash={() => stash.setIsStashOpen((v) => !v)}
              onStashMessageChange={stash.setStashMessage}
              onStashSave={stash.handleStashSave}
              onStashPop={stash.handleStashPop}
              onStashApply={stash.handleStashApply}
              onStashDrop={stash.handleStashDrop}
              onToggleWorkingChanges={() => setWorkingChangesOpen((v) => !v)}
              onToggleLocalBranches={() => setLocalBranchesOpen((v) => !v)}
              onToggleRemoteBranches={() => setRemoteBranchesOpen((v) => !v)}
              onSelectFile={working.handleViewWorkingDiff}
              onToggleFileCheck={(e, path) => {
                e.stopPropagation();
                working.setSelectedWorkingFiles((prev) =>
                  prev.includes(path) ? prev.filter((p) => p !== path) : [...prev, path]
                );
              }}
              onSelectAll={() => {
                if (working.selectedWorkingFiles.length === working.workingFiles.length) {
                  working.setSelectedWorkingFiles([]);
                } else {
                  working.setSelectedWorkingFiles(working.workingFiles.map((f) => f.path));
                }
              }}
              onRefreshWorking={() => repo.refreshWorkingStatus(repo.activeRepoPath)}
              onCommit={working.handleCommitWorkingChanges}
              onPush={working.handlePushRemote}
              onCommitMessageChange={working.setCommitMessage}
              onBranchClick={branch.handleBranchClick}
              onBranchContextMenu={(_, state) => branch.setContextMenu(state)}
              onToggleBranchFolder={(folder) =>
                setCollapsedBranchFolders((prev) => ({ ...prev, [folder]: !prev[folder] }))
              }
              onClearBranchFilter={() => branch.applyBranchFilter(null)}
            />
          </aside>

          {/* 右侧主区域 */}
          <main className={`content-workspace dock-${layout.dockPosition}`}>
            <CommitList
              commits={log.filteredCommits}
              selectedSha={log.selectedSha}
              graphWidth={graphWidth}
              searchQuery={log.searchQuery}
              hasMore={repo.repoDetails?.has_more ?? false}
              isLoadingMore={log.isLoadingMore}
              onSelectCommit={log.handleSelectCommit}
              onSearchChange={log.setSearchQuery}
              onLoadMore={log.handleLoadMore}
            />

            <CommitDetail
              currentCommit={log.currentCommit}
              currentFiles={log.currentFiles}
              diffStats={log.diffStats}
              activeRepoPath={repo.activeRepoPath}
              detailsCollapsed={log.detailsCollapsed}
              dockPosition={layout.dockPosition}
              detailsHeight={layout.detailsHeight}
              detailsWidth={layout.detailsWidth}
              isResizingDetails={layout.isResizingDetails}
              copied={log.copied}
              onToggleCollapse={() => log.setDetailsCollapsed((v) => !v)}
              onToggleDock={layout.toggleDockPosition}
              onCopySha={log.handleCopySha}
              onResizeMouseDown={(e) => { e.preventDefault(); layout.setIsResizingDetails(true); }}
            />
          </main>
        </div>
      )}

      {/* 分支右键菜单 */}
      {branch.contextMenu && (
        <BranchContextMenu
          contextMenu={branch.contextMenu}
          repoDetails={repo.repoDetails}
          onCheckout={branch.handleCheckoutBranch}
          onMerge={(sourceBranch, isSquash) => {
            const cur = repo.repoDetails?.repo.branch || "HEAD";
            branch.setMergeModal({
              visible: true,
              sourceBranch,
              targetBranch: cur,
              isSquash,
              commitMsg: isSquash
                ? `Squash merge branch '${sourceBranch}'`
                : `Merge branch '${sourceBranch}' into ${cur}`,
            });
          }}
          onCreateBranch={(state: CreateBranchModalState) =>
            branch.setCreateBranchModal(state)
          }
          onDelete={branch.handleDeleteBranch}
          onClose={() => branch.setContextMenu(null)}
        />
      )}

      {/* 合并弹窗 */}
      {branch.mergeModal && (
        <MergeModal
          modal={branch.mergeModal}
          loading={branch.mergeLoading}
          onChange={(patch) =>
            branch.setMergeModal((prev) =>
              prev ? { ...prev, ...patch } as MergeModalState : null
            )
          }
          onConfirm={branch.handleExecuteMerge}
          onClose={() => branch.setMergeModal(null)}
        />
      )}

      {/* 新建分支弹窗 */}
      {branch.createBranchModal && (
        <CreateBranchModal
          modal={branch.createBranchModal}
          onChange={(patch) =>
            branch.setCreateBranchModal((prev) =>
              prev ? { ...prev, ...patch } as CreateBranchModalState : null
            )
          }
          onConfirm={branch.handleCreateBranch}
          onClose={() => branch.setCreateBranchModal(null)}
        />
      )}

      {/* 工作区 Diff 弹窗 */}
      {working.activeWorkingDiff && (
        <div
          className="diff-modal-overlay"
          onClick={working.closeWorkingDiff}
        >
          <div
            className={`diff-modal-window ${working.isWorkingDiffMaximized ? "is-maximized" : ""}`}
            onClick={(e) => e.stopPropagation()}
          >
            <DiffViewer
              diffText={working.activeWorkingDiff.diffText}
              filePath={working.activeWorkingDiff.path}
              isExpandedModal={true}
              isMaximized={working.isWorkingDiffMaximized}
              onToggleMaximize={() =>
                working.setIsWorkingDiffMaximized(!working.isWorkingDiffMaximized)
              }
              onCloseModal={working.closeWorkingDiff}
            />
          </div>
        </div>
      )}

      {/* Clone 弹窗 */}
      {showCloneModal && (
        <CloneModal
          showToast={showToast}
          onSuccess={(repoPath) => repo.loadRepo(repoPath)}
          onClose={() => setShowCloneModal(false)}
        />
      )}
    </div>
  );
}
