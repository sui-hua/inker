import React from "react";
import { GitMerge, X } from "lucide-react";
import type { MergeModalState } from "../types";

interface MergeModalProps {
  modal: MergeModalState;
  loading: boolean;
  onChange: (patch: Partial<MergeModalState>) => void;
  onConfirm: () => void;
  onClose: () => void;
}

export const MergeModal: React.FC<MergeModalProps> = ({
  modal,
  loading,
  onChange,
  onConfirm,
  onClose,
}) => (
  <div className="modal-overlay" onClick={onClose}>
    <div
      className="modal-dialog merge-modal-dialog"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="modal-header">
        <div className="modal-title">
          <GitMerge size={16} />
          <span>{modal.isSquash ? "Squash 合并分支" : "合并分支"}</span>
        </div>
        <button type="button" className="modal-close-btn" onClick={onClose}>
          <X size={14} />
        </button>
      </div>

      <div className="modal-body">
        <div className="merge-info-card">
          <div className="merge-direction">
            <span className="merge-branch-tag source">{modal.sourceBranch}</span>
            <span className="merge-arrow">➔</span>
            <span className="merge-branch-tag target">
              {modal.targetBranch} (当前分支)
            </span>
          </div>
          <p className="merge-description">
            {modal.isSquash
              ? "Squash 合并将来源分支的所有提交压缩为当前分支上的单次合并提交，保持主干历史整洁。"
              : "普通合并保留完整的来源分支历史记录，并通过单独的 Merge Commit 合并入当前分支。"}
          </p>
        </div>

        <div className="form-field-group">
          <label className="form-label">合并提交说明 (Commit Message)</label>
          <textarea
            className="form-textarea"
            rows={3}
            value={modal.commitMsg}
            onChange={(e) => onChange({ commitMsg: e.target.value })}
          />
        </div>
      </div>

      <div className="modal-footer">
        <button type="button" className="btn-secondary" onClick={onClose}>
          取消
        </button>
        <button
          type="button"
          className="btn-primary"
          onClick={onConfirm}
          disabled={loading}
        >
          {loading ? "正在合并..." : "确认合并"}
        </button>
      </div>
    </div>
  </div>
);
