import React from "react";
import {
  FolderGit2,
  Folder,
  FolderPlus,
  Sun,
  Moon,
  RefreshCw,
  X,
  UploadCloud,
  DownloadCloud,
  ArrowDownUp,
  GitBranch,
} from "lucide-react";
import type { RepoInfo } from "../types";

interface TopBarProps {
  repos: RepoInfo[];
  activeRepoPath: string;
  loading: boolean;
  isPushing: boolean;
  isPulling: boolean;
  isFetching: boolean;
  theme: "light" | "dark";
  onSwitchRepo: (path: string) => void;
  onCloseRepo: (e: React.MouseEvent, path: string) => void;
  onOpenFolder: () => void;
  onClone: () => void;
  onPush: () => void;
  onPull: () => void;
  onFetch: () => void;
  onRefresh: () => void;
  onToggleTheme: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  repos,
  activeRepoPath,
  loading,
  isPushing,
  isPulling,
  isFetching,
  theme,
  onSwitchRepo,
  onCloseRepo,
  onOpenFolder,
  onClone,
  onPush,
  onPull,
  onFetch,
  onRefresh,
  onToggleTheme,
}) => (
  <header className="top-navbar">
    <div className="tabs-cluster">
      {repos.map((r) => {
        const isActive = r.path === activeRepoPath;
        return (
          <button
            key={r.path}
            className={`repo-tab ${isActive ? "active" : ""}`}
            onClick={() => onSwitchRepo(r.path)}
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
              onClick={(e) => onCloseRepo(e, r.path)}
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
        onClick={onOpenFolder}
        title="打开本地 Git 仓库或工作区文件夹"
      >
        <FolderPlus size={14} />
      </button>

      <button
        className="icon-action-btn"
        onClick={onClone}
        title="克隆远程仓库 (git clone)"
      >
        <GitBranch size={14} />
      </button>

      {activeRepoPath && (
        <>
          <button
            className="icon-action-btn"
            onClick={onFetch}
            disabled={isFetching}
            title="拉取远程元数据 (git fetch)"
          >
            <ArrowDownUp size={13} className={isFetching ? "spin-icon" : ""} />
          </button>

          <button
            className="icon-action-btn"
            onClick={onPull}
            disabled={isPulling}
            title="拉取并合并远程改动 (git pull)"
          >
            <DownloadCloud size={14} className={isPulling ? "spin-icon" : ""} />
          </button>

          <button
            className="icon-action-btn"
            onClick={onPush}
            disabled={isPushing}
            title="推送到远程仓库 (git push)"
          >
            <UploadCloud size={14} className={isPushing ? "spin-icon" : ""} />
          </button>

          <button
            className="icon-action-btn"
            onClick={onRefresh}
            title="刷新当前仓库与工作区状态"
          >
            <RefreshCw size={13} className={loading ? "spin-icon" : ""} />
          </button>
        </>
      )}

      <button
        className="icon-action-btn"
        onClick={onToggleTheme}
        title={theme === "dark" ? "切换为浅色模式" : "切换为暗色模式"}
      >
        {theme === "dark" ? <Moon size={14} /> : <Sun size={14} />}
      </button>
    </div>
  </header>
);
