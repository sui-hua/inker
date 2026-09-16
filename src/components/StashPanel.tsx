import React from "react";
import { ChevronDown, Archive, DownloadCloud, Play, Trash2 } from "lucide-react";
import type { StashItem } from "../types";

interface StashPanelProps {
  stashes: StashItem[];
  stashMessage: string;
  isOpen: boolean;
  onToggle: () => void;
  onMessageChange: (msg: string) => void;
  onSave: () => void;
  onPop: (index: number) => void;
  onApply: (index: number) => void;
  onDrop: (index: number) => void;
}

export const StashPanel: React.FC<StashPanelProps> = ({
  stashes,
  stashMessage,
  isOpen,
  onToggle,
  onMessageChange,
  onSave,
  onPop,
  onApply,
  onDrop,
}) => (
  <div className="accordion-section stash-section">
    <div className="accordion-header-btn" onClick={onToggle}>
      <div className="accordion-header-left">
        <ChevronDown
          size={12}
          className={`accordion-chevron-icon ${isOpen ? "open" : ""}`}
        />
        <Archive size={13} className="accordion-section-icon" />
        <span className="accordion-title">暂存区 Stash</span>
      </div>
      <div className="accordion-header-right">
        <span className={`accordion-count-badge ${stashes.length > 0 ? "has-changes" : ""}`}>
          {stashes.length}
        </span>
      </div>
    </div>

    <div className={`accordion-collapse-wrapper ${isOpen ? "expanded" : "collapsed"}`}>
      <div className="accordion-collapse-inner">
        <div className="sidebar-changes-zone">

          {/* 快速暂存输入 */}
          <div className="stash-save-row">
            <input
              className="stash-message-input"
              type="text"
              placeholder="暂存说明（可选）"
              value={stashMessage}
              onChange={(e) => onMessageChange(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && onSave()}
            />
            <button
              type="button"
              className="stash-save-btn"
              onClick={onSave}
              title="暂存当前工作区改动 (git stash)"
            >
              <Archive size={12} />
              <span>暂存</span>
            </button>
          </div>

          {/* Stash 列表 */}
          <div className="stash-list">
            {stashes.length === 0 ? (
              <div className="changes-empty-hint">
                <Archive size={14} color="var(--ink-tertiary)" />
                <span>暂无 stash 记录</span>
              </div>
            ) : (
              stashes.map((s) => (
                <div key={s.index} className="stash-item-row">
                  <div className="stash-item-info">
                    <span className="stash-index-badge">
                      stash@{"{"}
                      {s.index}
                      {"}"}
                    </span>
                    <span className="stash-item-msg" title={s.message}>
                      {s.message || `WIP on ${s.branch}`}
                    </span>
                    <span className="stash-item-date">{s.date}</span>
                  </div>
                  <div className="stash-item-actions">
                    <button
                      type="button"
                      className="stash-action-btn"
                      onClick={() => onPop(s.index)}
                      title="弹出：应用并删除此 stash"
                    >
                      <DownloadCloud size={12} />
                    </button>
                    <button
                      type="button"
                      className="stash-action-btn"
                      onClick={() => onApply(s.index)}
                      title="应用：保留 stash 记录"
                    >
                      <Play size={12} />
                    </button>
                    <button
                      type="button"
                      className="stash-action-btn danger"
                      onClick={() => onDrop(s.index)}
                      title="丢弃此 stash"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  </div>
);
