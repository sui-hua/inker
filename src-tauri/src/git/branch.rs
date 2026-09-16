use super::utils::run_git_in;

#[tauri::command]
pub fn create_branch(
    repo_path: String,
    branch_name: String,
    from: Option<String>,
) -> Result<String, String> {
    let name = branch_name.trim();
    if name.is_empty() {
        return Err("分支名不能为空".into());
    }
    if let Some(base) = from {
        run_git_in(&repo_path, &["checkout", "-b", name, &base])
    } else {
        run_git_in(&repo_path, &["checkout", "-b", name])
    }
}

#[tauri::command]
pub fn delete_branch(
    repo_path: String,
    branch_name: String,
    force: bool,
) -> Result<String, String> {
    let flag = if force { "-D" } else { "-d" };
    run_git_in(&repo_path, &["branch", flag, &branch_name])
}
