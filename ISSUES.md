# Inker 问题清单

> 基于代码审查整理，按优先级排序。

---

## 一、架构问题

### 1. `App.tsx` 单文件过于臃肿
**位置**：`src/App.tsx`（1540 行）

所有状态、业务逻辑、渲染 JSX 全部堆在同一个组件内，没有状态管理分层。随着功能增加，这个文件将越来越难以维护和测试。

**建议**：
- 引入 Zustand 或 React Context 将状态按领域拆分（仓库状态、工作区状态、UI 状态）
- 将业务逻辑抽成自定义 Hook（`useRepo`、`useWorkingStatus`、`useBranchActions` 等）
- 将大段 JSX 拆成独立子组件（侧边栏、提交列表、上下文菜单、弹窗等）

### 2. Rust 后端单文件无模块划分
**位置**：`src-tauri/src/lib.rs`（613 行）

所有数据结构、工具函数、Tauri 命令写在同一个文件，后续扩展会变得混乱。

**建议**：按职责拆分模块，例如 `git/repo.rs`、`git/commits.rs`、`git/working.rs`。

---

## 二、功能缺口

### 3. 无 `git pull` / `git fetch`
目前只能推送，无法从远程拉取更新。用户需要外部工具才能同步远程变更，是日常使用的核心缺失。

### 4. 无分支创建与删除
侧边栏可以查看分支、切换分支，但不能新建分支，也不能删除本地或远程分支。

### 5. 无 Stash 支持
切换分支前若有未提交的修改，只能手动去命令行处理，缺少 `git stash` 的入口。

### 6. 提交历史硬限 100 条，无分页
**位置**：`src-tauri/src/lib.rs:209`

```rust
let mut args = vec!["log", "-n", "100"];
```

大型仓库只能看到最近 100 条提交，无法翻页或加载更多。

### 7. 无提交搜索与过滤
提交列表没有按关键词、作者、日期范围过滤的能力，历史记录多了之后难以定位。

### 8. 无冲突解决 UI
执行合并后若发生冲突，应用没有任何提示或解决入口，用户只能退回命令行处理，体验断裂。

### 9. 无 Clone 仓库功能
只能打开本地已存在的仓库，无法直接从远程 URL 克隆。

---

## 三、逻辑缺陷

### 10. `commit_working_changes` 忽略 staged 状态
**位置**：`src-tauri/src/lib.rs:517`

```rust
for f in &files {
    let clean = clean_git_path(f);
    run_git_in(&repo_path, &["add", "--", &clean])?;  // 无条件重新 add
}
```

前端虽然区分了 `staged: true/false`，但提交时无论文件原本是否已暂存，后端都会重新执行 `git add`，实际上抹掉了用户在暂存区的手动操作。

### 11. `push_remote` 不处理新分支首次推送
**位置**：`src-tauri/src/lib.rs:547`

```rust
run_git_in(&repo_path, &["push"])  // 无 --set-upstream
```

本地新建的分支第一次推送时，`git push` 不带 `--set-upstream origin <branch>` 会直接报错，应用没有处理这种情况。

### 12. Git 拓扑图算法对复杂分支场景不准确
**位置**：`src/components/GitGraphView.tsx`

`graph_col` 的计算逻辑是简化实现，在多分支频繁交叉合并的场景下，连线和节点列位置可能出现错位或重叠。

### 13. localStorage key 全部硬编码为字符串
**位置**：`src/App.tsx`，多处散落

```ts
localStorage.getItem("git_client_theme")
localStorage.getItem("git_client_manual_repos")
localStorage.getItem("git_client_active_repo_path")
// ...
```

Key 字符串散落在十余处，一旦需要统一修改或加版本号前缀，容易遗漏。应集中为常量或枚举。

---

## 四、体验细节

### 14. 工作区 diff 弹窗无法通过键盘关闭后保持文件选中状态
点击文件查看 diff 后，按 Escape 关闭弹窗时焦点会丢失，无法用键盘继续操作文件列表。

### 15. 远程分支写死显示 `origin`
**位置**：`src/App.tsx:1096`

```tsx
<span>origin</span>
```

远程名称硬编码为 `origin`，无法支持多 remote（如同时有 `origin` 和 `upstream`）的仓库。

### 16. 无操作确认保护
切换分支、合并操作（非弹窗路径）在工作区有未提交改动时不给任何警告，可能导致意外丢失修改。

---

## 优先级建议

| 优先级 | 问题编号 |
|--------|---------|
| 高（影响基本可用性） | #3（pull/fetch）、#4（分支管理）、#11（push 新分支）、#10（staged 逻辑） |
| 中（影响日常体验） | #6（提交翻页）、#7（搜索）、#8（冲突提示）、#1（App.tsx 拆分） |
| 低（完善性优化） | #5（Stash）、#9（Clone）、#12（图算法）、#13（常量）、#15（多 remote）、#16（操作保护） |
