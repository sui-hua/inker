use super::utils::run_git_in;

/// 检测当前分支是否已设置上游 remote tracking
fn has_upstream(repo_path: &str) -> bool {
    run_git_in(
        repo_path,
        &["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"],
    )
    .is_ok()
}

/// 获取当前分支名
fn current_branch(repo_path: &str) -> Option<String> {
    run_git_in(repo_path, &["branch", "--show-current"])
        .ok()
        .filter(|s| !s.is_empty())
}

#[tauri::command]
pub fn push_remote(
    repo_path: String,
    remote: Option<String>,
    branch: Option<String>,
) -> Result<String, String> {
    let remote_name = remote.as_deref().unwrap_or("origin");

    if let Some(b) = branch {
        // 显式指定了分支
        run_git_in(&repo_path, &["push", remote_name, &b])
    } else if has_upstream(&repo_path) {
        // 已有上游，直接推
        run_git_in(&repo_path, &["push"])
    } else {
        // 没有上游：自动加 --set-upstream
        let branch_name = current_branch(&repo_path)
            .ok_or_else(|| "无法获取当前分支名".to_string())?;
        run_git_in(
            &repo_path,
            &["push", "--set-upstream", remote_name, &branch_name],
        )
    }
}

#[tauri::command]
pub fn pull_remote(
    repo_path: String,
    remote: Option<String>,
    branch: Option<String>,
) -> Result<String, String> {
    let remote_name = remote.as_deref().unwrap_or("origin");
    if let Some(b) = branch {
        run_git_in(&repo_path, &["pull", remote_name, &b])
    } else {
        run_git_in(&repo_path, &["pull"])
    }
}

#[tauri::command]
pub fn fetch_remote(repo_path: String, remote: Option<String>) -> Result<String, String> {
    let remote_name = remote.as_deref().unwrap_or("origin");
    run_git_in(&repo_path, &["fetch", remote_name])
}

#[tauri::command]
pub fn merge_branch(
    repo_path: String,
    source_branch: String,
    is_squash: bool,
    commit_msg: Option<String>,
) -> Result<String, String> {
    if is_squash {
        let output = run_git_in(&repo_path, &["merge", "--squash", &source_branch])?;
        let msg = commit_msg
            .filter(|m| !m.trim().is_empty())
            .unwrap_or_else(|| format!("Squash merge branch '{}'", source_branch));
        let commit_res = run_git_in(&repo_path, &["commit", "-m", &msg])?;
        Ok(format!("{}\n{}", output, commit_res))
    } else {
        let msg = commit_msg
            .filter(|m| !m.trim().is_empty())
            .unwrap_or_else(|| format!("Merge branch '{}'", source_branch));
        run_git_in(
            &repo_path,
            &["merge", "--no-ff", &source_branch, "-m", &msg],
        )
    }
}
