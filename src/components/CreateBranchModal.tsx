import React from "react";
import { GitFork, X } from "lucide-react";
import type { CreateBranchModalState } from "../types";

interface CreateBranchModalProps {
  modal: CreateBranchModalState;
  onChange: (patch: Partial<CreateBranchModalState>) => void;
  onConfirm: () => void;
  onClose: () => void;
}

export const CreateBranchModal: React.FC<CreateBranchModalProps> = ({
  modal,
  onChange,
  onConfirm,
  onClose,
}) => (
  <div className="modal-overlay" onClick={onClose}>
    <div
      className="modal-dialog"
      style={{ maxWidth: 400 }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="modal-header">
        <div className="modal-title">
          <GitFork size={16} />
          <span>新建分支</span>
        </div>
        <button type="button" className="modal-close-btn" onClick={onClose}>
          <X size={14} />
        </button>
      </div>

      <div className="modal-body">
        {modal.baseBranch && (
          <div className="merge-info-card" style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 12, color: "var(--ink-secondary)" }}>
              基于分支：<span className="merge-branch-tag source">{modal.baseBranch}</span>
            </div>
          </div>
        )}
        <div className="form-field-group">
          <label className="form-label">新分支名称</label>
          <input
            className="form-textarea"
            style={{ height: 36, padding: "6px 10px", fontFamily: "var(--font-mono)" }}
            type="text"
            placeholder="例如: feature/my-feature"
            value={modal.newName}
            autoFocus
            onChange={(e) => onChange({ newName: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === "Enter") onConfirm();
              if (e.key === "Escape") onClose();
            }}
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
          disabled={!modal.newName.trim()}
        >
          创建并切换
        </button>
      </div>
    </div>
  </div>
);
