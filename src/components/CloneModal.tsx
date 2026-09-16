import React, { useState } from "react";
import { GitBranch, X, FolderOpen, RefreshCw } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";

interface CloneModalProps {
  onSuccess: (repoPath: string) => void;
  onClose: () => void;
  showToast: (msg: string) => void;
}

export const CloneModal: React.FC<CloneModalProps> = ({
  onSuccess,
  onClose,
  showToast,
}) => {
  const [url, setUrl] = useState("");
  const [targetDir, setTargetDir] = useState("");
  const [isCloning, setIsCloning] = useState(false);

  const handlePickDir = async () => {
    try {
      const paths = await invoke<string[]>("open_folder_dialog");
      if (paths?.length > 0) setTargetDir(paths[0]);
    } catch {
      // 用户取消
    }
  };

  const handleClone = async () => {
    const trimUrl = url.trim();
    const trimDir = targetDir.trim();
    if (!trimUrl) { showToast("请输入仓库 URL"); return; }
    if (!trimDir) { showToast("请选择目标目录"); return; }

    setIsCloning(true);
    try {
      const repoPath = await invoke<string>("clone_repository", {
        url: trimUrl,
        targetDir: trimDir,
      });
      showToast(`克隆成功: ${repoPath}`);
      onSuccess(repoPath);
      onClose();
    } catch (err) {
      showToast(`克隆失败: ${String(err)}`);
    } finally {
      setIsCloning(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-dialog"
        style={{ maxWidth: 480 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <div className="modal-title">
            <GitBranch size={16} />
            <span>克隆远程仓库</span>
          </div>
          <button type="button" className="modal-close-btn" onClick={onClose}>
            <X size={14} />
          </button>
        </div>

        <div className="modal-body" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div className="form-field-group">
            <label className="form-label">仓库 URL</label>
            <input
              className="form-textarea"
              style={{ height: 34, padding: "0 10px", fontFamily: "var(--font-mono)", fontSize: 12 }}
              type="text"
              placeholder="https://github.com/user/repo.git"
              value={url}
              autoFocus
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !isCloning && handleClone()}
            />
          </div>

          <div className="form-field-group">
            <label className="form-label">克隆到目录</label>
            <div style={{ display: "flex", gap: 6 }}>
              <input
                className="form-textarea"
                style={{ flex: 1, height: 34, padding: "0 10px", fontFamily: "var(--font-mono)", fontSize: 12 }}
                type="text"
                placeholder="选择父目录，仓库将克隆为其子文件夹"
                value={targetDir}
                readOnly
                onClick={handlePickDir}
              />
              <button
                type="button"
                className="icon-action-btn"
                style={{ height: 34, width: 34, border: "1px solid var(--hairline)", borderRadius: 4 }}
                onClick={handlePickDir}
                title="选择目标目录"
              >
                <FolderOpen size={14} />
              </button>
            </div>
          </div>

          {url.trim() && targetDir.trim() && (
            <div style={{
              fontSize: 11,
              color: "var(--ink-tertiary)",
              fontFamily: "var(--font-mono)",
              padding: "4px 8px",
              background: "var(--canvas)",
              borderRadius: 4,
              border: "1px solid var(--hairline)",
            }}>
              将克隆到：{targetDir}/{url.trim().replace(/\.git$/, "").split("/").pop()}
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button type="button" className="btn-secondary" onClick={onClose} disabled={isCloning}>
            取消
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={handleClone}
            disabled={isCloning || !url.trim() || !targetDir.trim()}
          >
            {isCloning ? (
              <>
                <RefreshCw size={12} className="spin-icon" style={{ marginRight: 5 }} />
                克隆中...
              </>
            ) : (
              "开始克隆"
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
