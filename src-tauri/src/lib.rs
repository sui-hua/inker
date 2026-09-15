use serde::{Deserialize, Serialize};
use std::path::Path;
use std::process::Command;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct RepoInfo {
    pub id: String,
    pub name: String,
    pub path: String,
    pub branch: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ChangedFile {
    pub name: String,
    pub file_type: String,
    pub additions: i32,
    pub deletions: i32,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct RefTag {
    pub name: String,
    pub is_head: bool,
    pub is_tag: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CommitItem {
    pub sha: String,
    pub full_sha: String,
    pub msg: String,
    pub author: String,
    pub author_email: String,
    pub date: String,
    pub parent_shas: Vec<String>,
    pub ref_tags: Vec<RefTag>,
    pub files: Vec<ChangedFile>,
    pub graph_col: usize,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct BranchItem {
    pub name: String,
    pub is_head: bool,
    pub is_remote: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct RepoDetails {
    pub repo: RepoInfo,
    pub local_branches: Vec<BranchItem>,
    pub remote_branches: Vec<BranchItem>,
    pub commits: Vec<CommitItem>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct StatusFile {
    pub path: String,
    pub status: String,
    pub staged: bool,
}

fn determine_file_type(filename: &str) -> String {
    let path = Path::new(filename);
    if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
        match ext.to_lowercase().as_str() {
            "java" => "J".into(),
            "ts" | "tsx" => "TS".into(),
            "js" | "jsx" => "JS".into(),
            "rs" => "RS".into(),
            "py" => "PY".into(),
            "go" => "GO".into(),
            "css" | "scss" | "less" => "CSS".into(),
            "html" | "htm" => "HTML".into(),
            "json" => "JSON".into(),
            "yml" | "yaml" => "YML".into(),
            "xml" => "XML".into(),
            "md" => "MD".into(),
            "sql" => "SQL".into(),
            "sh" | "bash" | "zsh" => "SH".into(),
            _ => ext.chars().take(3).collect::<String>().to_uppercase(),
        }
    } else {
        "FILE".into()
    }
}

fn parse_ref_tags(raw_d: &str) -> Vec<RefTag> {
    let mut tags = Vec::new();
    let trimmed_all = raw_d.trim();
    if trimmed_all.is_empty() {
        return tags;
    }

    for item in trimmed_all.split(',') {
        let trimmed = item.trim();
        if trimmed.is_empty() {
            continue;
        }

        if let Some(target) = trimmed.strip_prefix("HEAD -> ") {
            tags.push(RefTag {
                name: target.trim().to_string(),
                is_head: true,
                is_tag: false,
            });
        } else if let Some(tag_name) = trimmed.strip_prefix("tag: ") {
            tags.push(RefTag {
                name: tag_name.trim().to_string(),
                is_head: false,
                is_tag: true,
            });
        } else if trimmed != "HEAD" {
            tags.push(RefTag {
                name: trimmed.to_string(),
                is_head: false,
                is_tag: false,
            });
        }
    }

    tags
}

fn clean_git_path(raw: &str) -> String {
    let unquoted = raw.trim().trim_matches('"');
    if unquoted.contains(" => ") {
        if let (Some(start), Some(end)) = (unquoted.find('{'), unquoted.find('}')) {
            let prefix = &unquoted[..start];
            let middle = &unquoted[start + 1..end];
            let suffix = &unquoted[end + 1..];
            if let Some(target) = middle.split(" => ").nth(1) {
                return format!("{}{}{}", prefix, target, suffix);
            }
        } else if let Some(target) = unquoted.split(" => ").nth(1) {
            return target.to_string();
        }
    }
    unquoted.to_string()
}

fn run_git_in(repo_path: &str, args: &[&str]) -> Result<String, String> {
    let mut full_args = vec![
        "-c",
        "core.quotepath=false",
        "-c",
        "i18n.logOutputEncoding=utf-8",
        "-c",
        "i18n.commitEncoding=utf-8",
    ];
    full_args.extend_from_slice(args);

    let output = Command::new("git")
        .current_dir(repo_path)
        .args(&full_args)
        .output()
        .map_err(|e| format!("无法执行 git 命令: {}", e))?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).trim().to_string())
    }
}

fn get_repo_branch(repo_path: &str) -> String {
    if let Ok(branch) = run_git_in(repo_path, &["branch", "--show-current"]) {
        if !branch.is_empty() {
            return branch;
        }
    }
    if let Ok(rev) = run_git_in(repo_path, &["rev-parse", "--short", "HEAD"]) {
        if !rev.is_empty() {
            return rev;
        }
    }
    "HEAD".into()
}

fn fetch_commit_files(repo_path: &str, sha: &str) -> Vec<ChangedFile> {
    let mut files = Vec::new();
    let numstat_out = run_git_in(repo_path, &["show", "--numstat", "--pretty=format:", sha])
        .unwrap_or_default();

    for line in numstat_out.lines() {
        let parts: Vec<&str> = line.split('\t').collect();
        if parts.len() >= 3 {
            let add = parts[0].parse::<i32>().unwrap_or(0);
            let del = parts[1].parse::<i32>().unwrap_or(0);
            let raw_filename = parts[2].trim();
            let filename = clean_git_path(raw_filename);
            let file_type = determine_file_type(&filename);
            files.push(ChangedFile {
                name: filename,
                file_type,
                additions: add,
                deletions: del,
            });
        }
    }
    files
}

fn fetch_commits_internal(repo_path: &str, branch: Option<&str>) -> Vec<CommitItem> {
    let mut commits = Vec::new();
    let log_format = "%h%x09%H%x09%s%x09%an%x09%ae%x09%ad%x09%p%x09%D";

    let mut args = vec!["log", "-n", "100"];
    let branch_str;
    if let Some(b) = branch {
        if !b.trim().is_empty() {
            branch_str = b.to_string();
            args.push(&branch_str);
        } else {
            args.push("--all");
        }
    } else {
        args.push("--all");
    }

    let fmt_arg = format!("--pretty=format:{}", log_format);
    args.push(&fmt_arg);
    args.push("--date=format:%Y-%m-%d %H:%M");

    if let Ok(log_output) = run_git_in(repo_path, &args) {
        for line in log_output.lines() {
            let parts: Vec<&str> = line.split('\t').collect();
            if parts.len() >= 6 {
                let sha = parts[0].to_string();
                let full_sha = parts[1].to_string();
                let raw_subject = parts[2];
                let author = parts[3].to_string();
                let author_email = parts[4].to_string();
                let date = parts[5].to_string();
                let parents: Vec<String> = if parts.len() >= 7 {
                    parts[6]
                        .split_whitespace()
                        .map(|s| s.to_string())
                        .collect()
                } else {
                    Vec::new()
                };

                let ref_tags = if parts.len() >= 8 {
                    parse_ref_tags(parts[7])
                } else {
                    Vec::new()
                };

                commits.push(CommitItem {
                    sha,
                    full_sha,
                    msg: raw_subject.trim().to_string(),
                    author,
                    author_email,
                    date,
                    parent_shas: parents,
                    ref_tags,
                    files: Vec::new(),
                    graph_col: 0,
                });
            }
        }
    }

    commits
}

#[tauri::command]
fn get_commits(repo_path: String, branch: Option<String>) -> Result<Vec<CommitItem>, String> {
    Ok(fetch_commits_internal(&repo_path, branch.as_deref()))
}

#[tauri::command]
fn load_repository(repo_path: String) -> Result<RepoDetails, String> {
    let p = Path::new(&repo_path);
    if !p.exists() {
        return Err("指定的目录不存在".into());
    }

    // 优先用快速本地文件探测 .git，避免启动 git 进程
    let is_git = p.join(".git").exists()
        || run_git_in(&repo_path, &["rev-parse", "--is-inside-work-tree"])
            .map(|s| s == "true")
            .unwrap_or(false);

    if !is_git {
        return Err("该目录不是一个合法的 Git 仓库（缺少 .git）".into());
    }

    let name = p
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| "repository".into());

    let mut current_branch = String::new();
    let mut local_branches = Vec::new();
    let mut remote_branches = Vec::new();

    // 1. 读取真实分支，同时直接提取当前活跃分支 (HEAD)，避免重复发起单独进程
    if let Ok(branch_output) = run_git_in(
        &repo_path,
        &["branch", "-a", "--format=%(refname)|%(refname:short)|%(HEAD)"],
    ) {
        for line in branch_output.lines() {
            let parts: Vec<&str> = line.split('|').collect();
            if parts.len() >= 3 {
                let refname = parts[0].trim();
                let shortname = parts[1].trim();
                let is_head = parts[2].trim() == "*";

                if is_head && current_branch.is_empty() {
                    current_branch = shortname.to_string();
                }

                if refname.starts_with("refs/heads/") {
                    local_branches.push(BranchItem {
                        name: shortname.to_string(),
                        is_head,
                        is_remote: false,
                    });
                } else if refname.starts_with("refs/remotes/") && !shortname.ends_with("/HEAD") {
                    let clean_name = shortname.strip_prefix("origin/").unwrap_or(shortname);
                    remote_branches.push(BranchItem {
                        name: clean_name.to_string(),
                        is_head: false,
                        is_remote: true,
                    });
                }
            }
        }
    }

    if current_branch.is_empty() {
        current_branch = get_repo_branch(&repo_path);
    }

    let repo = RepoInfo {
        id: repo_path.clone(),
        name,
        path: repo_path.clone(),
        branch: current_branch,
    };

    // 2. 初始加载全部分支提交 (--all)
    let commits = fetch_commits_internal(&repo_path, None);

    Ok(RepoDetails {
        repo,
        local_branches,
        remote_branches,
        commits,
    })
}

#[tauri::command]
fn get_file_diff(repo_path: String, sha: String, file_path: String) -> Result<String, String> {
    let clean_path = clean_git_path(&file_path);
    run_git_in(
        &repo_path,
        &[
            "show",
            "-m",
            "--first-parent",
            "--format=",
            "--color=never",
            &sha,
            "--",
            &clean_path,
        ],
    )
}

#[tauri::command]
fn get_commit_diff(repo_path: String, sha: String) -> Vec<ChangedFile> {
    fetch_commit_files(&repo_path, &sha)
}

#[tauri::command]
fn checkout_branch(repo_path: String, branch_name: String) -> Result<String, String> {
    run_git_in(&repo_path, &["checkout", &branch_name])
}

fn scan_git_repos(root: &Path) -> Vec<String> {
    let mut repos = Vec::new();
    // 1. 若当前所选目录本身就是一个 Git 仓库，先加入列表
    if root.join(".git").exists() {
        repos.push(root.to_string_lossy().to_string());
    }

    // 2. 无论当前目录自身是否是仓库，都继续扫描直接子目录这一层 (depth = 1)，识别嵌套的子仓库
    if let Ok(entries) = std::fs::read_dir(root) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                let file_name = path.file_name().and_then(|n| n.to_str()).unwrap_or("");
                if file_name.starts_with('.')
                    || file_name == "node_modules"
                    || file_name == "target"
                    || file_name == "dist"
                    || file_name == "build"
                    || file_name == "vendor"
                    || file_name == "AppData"
                {
                    continue;
                }
                if path.join(".git").exists() {
                    let path_str = path.to_string_lossy().to_string();
                    if !repos.contains(&path_str) {
                        repos.push(path_str);
                    }
                }
            }
        }
    }

    repos
}

#[tauri::command]
async fn open_folder_dialog() -> Result<Vec<String>, String> {
    let folder = rfd::AsyncFileDialog::new()
        .set_title("请选择一个包含 Git 仓库的项目或工作区目录")
        .pick_folder()
        .await;

    if let Some(folder_handle) = folder {
        let p = folder_handle.path();
        let mut found = scan_git_repos(p);
        if found.is_empty() {
            let path_str = p.to_string_lossy().to_string();
            let is_git = run_git_in(&path_str, &["rev-parse", "--is-inside-work-tree"])
                .map(|s| s == "true")
                .unwrap_or(false);
            if is_git {
                found.push(path_str);
            }
        }

        if found.is_empty() {
            return Err("所选目录及其子目录中未发现任何合法的 Git 仓库（缺少 .git）".into());
        }

        return Ok(found);
    }

    Ok(Vec::new())
}

#[tauri::command]
fn get_working_status(repo_path: String) -> Result<Vec<StatusFile>, String> {
    let output = run_git_in(&repo_path, &["status", "--porcelain=v1", "-unormal"])?;
    let mut files = Vec::new();
    for line in output.lines() {
        if line.len() < 3 {
            continue;
        }
        let index_status = &line[0..1];
        let work_status = &line[1..2];
        let raw_path = if line.len() >= 4 { &line[3..] } else { "" };
        let clean_path = clean_git_path(raw_path);

        if index_status == "?" && work_status == "?" {
            files.push(StatusFile {
                path: clean_path,
                status: "?".to_string(),
                staged: false,
            });
        } else {
            if index_status != " " && index_status != "?" {
                files.push(StatusFile {
                    path: clean_path.clone(),
                    status: index_status.to_string(),
                    staged: true,
                });
            }
            if work_status != " " && work_status != "?" {
                files.push(StatusFile {
                    path: clean_path,
                    status: work_status.to_string(),
                    staged: false,
                });
            }
        }
    }
    Ok(files)
}

#[tauri::command]
fn get_working_diff(repo_path: String, file_path: String, staged: bool) -> Result<String, String> {
    let clean = clean_git_path(&file_path);
    if staged {
        run_git_in(&repo_path, &["diff", "--cached", "--color=never", "--", &clean])
    } else {
        let diff = run_git_in(&repo_path, &["diff", "--color=never", "--", &clean])?;
        if diff.trim().is_empty() {
            let p = Path::new(&repo_path).join(&clean);
            if p.exists() && p.is_file() {
                if let Ok(content) = std::fs::read_to_string(&p) {
                    let line_count = content.lines().count().max(1);
                    let mut patch = format!("@@ -0,0 +1,{} @@\n", line_count);
                    for l in content.lines() {
                        patch.push('+');
                        patch.push_str(l);
                        patch.push('\n');
                    }
                    return Ok(patch);
                }
            }
        }
        Ok(diff)
    }
}

#[tauri::command]
fn commit_working_changes(
    repo_path: String,
    message: String,
    files: Vec<String>,
) -> Result<String, String> {
    let trimmed = message.trim();
    if trimmed.is_empty() {
        return Err("提交信息不能为空".into());
    }
    if files.is_empty() {
        run_git_in(&repo_path, &["add", "-A"])?;
    } else {
        for f in &files {
            let clean = clean_git_path(f);
            run_git_in(&repo_path, &["add", "--", &clean])?;
        }
    }
    run_git_in(&repo_path, &["commit", "-m", trimmed])
}

#[tauri::command]
fn push_remote(
    repo_path: String,
    remote: Option<String>,
    branch: Option<String>,
) -> Result<String, String> {
    let remote_name = remote.unwrap_or_else(|| "origin".to_string());
    if let Some(b) = branch {
        run_git_in(&repo_path, &["push", &remote_name, &b])
    } else {
        run_git_in(&repo_path, &["push"])
    }
}

#[tauri::command]
fn merge_branch(
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
        run_git_in(&repo_path, &["merge", "--no-ff", &source_branch, "-m", &msg])
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            load_repository,
            get_commits,
            get_commit_diff,
            get_file_diff,
            checkout_branch,
            open_folder_dialog,
            get_working_status,
            get_working_diff,
            commit_working_changes,
            push_remote,
            merge_branch
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_scan_current_repo() {
        let root = Path::new("..");
        let repos = scan_git_repos(root);
        assert!(!repos.is_empty(), "Should find at least one repo");
        println!("Found repos: {:?}", repos);
    }

    #[test]
    fn test_get_working_status() {
        let status = get_working_status("..".to_string());
        assert!(status.is_ok());
        println!("Working files count: {}", status.unwrap().len());
    }
}
