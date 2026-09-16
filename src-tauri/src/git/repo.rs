use serde::{Deserialize, Serialize};
use std::path::Path;

use super::utils::{clean_git_path, determine_file_type, run_git_in};

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
    pub remote: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct RepoDetails {
    pub repo: RepoInfo,
    pub local_branches: Vec<BranchItem>,
    pub remote_branches: Vec<BranchItem>,
    pub commits: Vec<CommitItem>,
    pub has_more: bool,
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

pub fn fetch_commit_files(repo_path: &str, sha: &str) -> Vec<ChangedFile> {
    let mut files = Vec::new();
    let numstat_out =
        run_git_in(repo_path, &["show", "--numstat", "--pretty=format:", sha]).unwrap_or_default();
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

pub fn fetch_commits_internal(
    repo_path: &str,
    branch: Option<&str>,
    offset: usize,
    limit: usize,
) -> Vec<CommitItem> {
    let mut commits = Vec::new();
    let log_format = "%h%x09%H%x09%s%x09%an%x09%ae%x09%ad%x09%p%x09%D";

    let skip_str = offset.to_string();
    let limit_str = limit.to_string();

    let mut args = vec!["log", "--topo-order", "--skip", &skip_str, "-n", &limit_str];

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

pub fn scan_git_repos(root: &Path) -> Vec<String> {
    let mut repos = Vec::new();
    if root.join(".git").exists() {
        repos.push(root.to_string_lossy().to_string());
    }
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

// ── Tauri 命令 ────────────────────────────────────────────────

#[tauri::command]
pub fn load_repository(repo_path: String) -> Result<RepoDetails, String> {
    let p = Path::new(&repo_path);
    if !p.exists() {
        return Err("指定的目录不存在".into());
    }

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

    if let Ok(branch_output) = run_git_in(
        &repo_path,
        &["branch", "-a", "--format=%(refname)|%(refname:short)|%(HEAD)|%(upstream:remotename)"],
    ) {
        for line in branch_output.lines() {
            let parts: Vec<&str> = line.split('|').collect();
            if parts.len() >= 3 {
                let refname = parts[0].trim();
                let shortname = parts[1].trim();
                let is_head = parts[2].trim() == "*";
                let remote_name = if parts.len() >= 4 { parts[3].trim() } else { "origin" };

                if is_head && current_branch.is_empty() {
                    current_branch = shortname.to_string();
                }

                if refname.starts_with("refs/heads/") {
                    local_branches.push(BranchItem {
                        name: shortname.to_string(),
                        is_head,
                        is_remote: false,
                        remote: remote_name.to_string(),
                    });
                } else if refname.starts_with("refs/remotes/") && !shortname.ends_with("/HEAD") {
                    // 从 refs/remotes/<remote>/<branch> 提取 remote 名和 branch 名
                    let without_prefix = refname.strip_prefix("refs/remotes/").unwrap_or(shortname);
                    let (remote, branch_short) = if let Some(idx) = without_prefix.find('/') {
                        (&without_prefix[..idx], &without_prefix[idx + 1..])
                    } else {
                        ("origin", without_prefix)
                    };
                    remote_branches.push(BranchItem {
                        name: branch_short.to_string(),
                        is_head: false,
                        is_remote: true,
                        remote: remote.to_string(),
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

    const PAGE: usize = 100;
    let commits = fetch_commits_internal(&repo_path, None, 0, PAGE + 1);
    let has_more = commits.len() > PAGE;
    let commits = commits.into_iter().take(PAGE).collect();

    Ok(RepoDetails {
        repo,
        local_branches,
        remote_branches,
        commits,
        has_more,
    })
}

#[tauri::command]
pub fn get_commits(
    repo_path: String,
    branch: Option<String>,
    offset: Option<usize>,
) -> Result<Vec<CommitItem>, String> {
    const PAGE: usize = 100;
    let off = offset.unwrap_or(0);
    let raw = fetch_commits_internal(&repo_path, branch.as_deref(), off, PAGE);
    Ok(raw)
}

#[tauri::command]
pub fn get_commit_diff(repo_path: String, sha: String) -> Vec<ChangedFile> {
    fetch_commit_files(&repo_path, &sha)
}

#[tauri::command]
pub fn get_file_diff(
    repo_path: String,
    sha: String,
    file_path: String,
) -> Result<String, String> {
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
pub fn checkout_branch(repo_path: String, branch_name: String) -> Result<String, String> {
    // 检查是否有未提交改动
    let status = run_git_in(&repo_path, &["status", "--porcelain=v1", "-unormal"])
        .unwrap_or_default();
    let dirty = status.lines().any(|l| l.len() >= 2);
    if dirty {
        // 尝试切换，若失败则返回友好错误
        run_git_in(&repo_path, &["checkout", &branch_name])
            .map_err(|e| format!("工作区有未提交的改动，切换分支失败: {}", e))
    } else {
        run_git_in(&repo_path, &["checkout", &branch_name])
    }
}

#[tauri::command]
pub async fn open_folder_dialog() -> Result<Vec<String>, String> {
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
            return Err(
                "所选目录及其子目录中未发现任何合法的 Git 仓库（缺少 .git）".into(),
            );
        }
        return Ok(found);
    }

    Ok(Vec::new())
}

#[tauri::command]
pub fn clone_repository(url: String, target_dir: String) -> Result<String, String> {
    use std::process::Command;

    let url = url.trim();
    let target = target_dir.trim();

    if url.is_empty() {
        return Err("仓库 URL 不能为空".into());
    }
    if target.is_empty() {
        return Err("目标目录不能为空".into());
    }

    // 提取仓库名作为子目录
    let repo_name = url
        .trim_end_matches('/')
        .trim_end_matches(".git")
        .rsplit('/')
        .next()
        .unwrap_or("repository")
        .to_string();

    let dest = std::path::Path::new(target).join(&repo_name);

    let output = Command::new("git")
        .args([
            "-c", "core.quotepath=false",
            "clone", "--progress", url,
            dest.to_str().unwrap_or(&repo_name),
        ])
        .output()
        .map_err(|e| format!("无法执行 git clone: {}", e))?;

    if output.status.success() {
        Ok(dest.to_string_lossy().to_string())
    } else {
        // git clone 进度输出到 stderr，错误信息也在 stderr
        Err(String::from_utf8_lossy(&output.stderr).trim().to_string())
    }
}
