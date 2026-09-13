use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
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
pub struct CommitItem {
    pub sha: String,
    pub full_sha: String,
    pub msg: String,
    pub prefix: String,
    pub author: String,
    pub author_email: String,
    pub date: String,
    pub parent_shas: Vec<String>,
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

fn extract_prefix_and_msg(raw_subject: &str) -> (String, String) {
    let s = raw_subject.trim();
    let prefixes = [
        "fix:", "feat:", "merge:", "chore:", "docs:", "style:", "refactor:", "perf:", "test:",
        "build:", "ci:", "revert:",
    ];

    for p in prefixes {
        if s.to_lowercase().starts_with(p) {
            let prefix = &s[..p.len()];
            let msg = s[p.len()..].trim();
            return (prefix.to_string(), msg.to_string());
        }
    }

    if s.to_lowercase().starts_with("merge branch")
        || s.to_lowercase().starts_with("merge remote-tracking branch")
    {
        return ("merge:".to_string(), s.to_string());
    }

    ("".to_string(), s.to_string())
}

fn clean_git_path(raw: &str) -> String {
    let unquoted = raw.trim().trim_matches('"');
    // 处理 Git 重命名格式，如 "{Iris/docs => docs}/superpowers/..." 或 "old.ts => new.ts"
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
    let mut full_args = vec!["-c", "core.quotepath=false"];
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

#[tauri::command]
fn load_repository(repo_path: String) -> Result<RepoDetails, String> {
    let p = Path::new(&repo_path);
    if !p.exists() {
        return Err("指定的目录不存在".into());
    }

    let is_git = run_git_in(&repo_path, &["rev-parse", "--is-inside-work-tree"])
        .map(|s| s == "true")
        .unwrap_or(false);

    if !is_git {
        return Err("该目录不是一个合法的 Git 仓库（缺少 .git）".into());
    }

    let name = p
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| "repository".into());
    let current_branch = get_repo_branch(&repo_path);

    let repo = RepoInfo {
        id: repo_path.clone(),
        name,
        path: repo_path.clone(),
        branch: current_branch,
    };

    // 1. 读取真实分支
    let mut local_branches = Vec::new();
    let mut remote_branches = Vec::new();

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

    // 2. 读取真实 commit 历史 (包含 author_email)
    let mut commits = Vec::new();
    let log_format = "%h%x09%H%x09%s%x09%an%x09%ae%x09%ad%x09%p";
    if let Ok(log_output) = run_git_in(
        &repo_path,
        &[
            "log",
            "-n",
            "50",
            &format!("--pretty=format:{}", log_format),
            "--date=format:%Y-%m-%d %H:%M",
        ],
    ) {
        let lines: Vec<&str> = log_output.lines().collect();
        for (i, line) in lines.iter().enumerate() {
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

                let (prefix, msg) = extract_prefix_and_msg(raw_subject);

                let files = if i < 10 {
                    fetch_commit_files(&repo_path, &sha)
                } else {
                    Vec::new()
                };

                let is_merge = parents.len() > 1;
                let graph_col = if is_merge { 1 } else { 0 };

                commits.push(CommitItem {
                    sha,
                    full_sha,
                    msg,
                    prefix,
                    author,
                    author_email,
                    date,
                    parent_shas: parents,
                    files,
                    graph_col,
                });
            }
        }
    }

    Ok(RepoDetails {
        repo,
        local_branches,
        remote_branches,
        commits,
    })
}

#[tauri::command]
fn get_commit_diff(repo_path: String, sha: String) -> Vec<ChangedFile> {
    fetch_commit_files(&repo_path, &sha)
}

#[tauri::command]
fn checkout_branch(repo_path: String, branch_name: String) -> Result<String, String> {
    run_git_in(&repo_path, &["checkout", &branch_name])
}

#[tauri::command]
fn open_folder_dialog() -> Option<String> {
    let script = r#"try
POSIX path of (choose folder with prompt "请选择一个 Git 仓库目录")
end try"#;

    let output = Command::new("osascript")
        .args(["-e", script])
        .output()
        .ok()?;

    if output.status.success() {
        let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if !path.is_empty() {
            let p = PathBuf::from(&path);
            if p.join(".git").exists() {
                return Some(path);
            }
        }
    }
    None
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            load_repository,
            get_commit_diff,
            checkout_branch,
            open_folder_dialog
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_clean_git_path() {
        assert_eq!(clean_git_path("\"UI设计.md\""), "UI设计.md");
        assert_eq!(
            clean_git_path("{Iris/docs => docs}/superpowers/specs/design.md"),
            "docs/superpowers/specs/design.md"
        );
    }
}

#[cfg(test)]
mod tests_playground {
    use super::*;

    #[test]
    fn test_git_playground() {
        let path = "/Users/sifan1/Documents/project/git-playground".to_string();
        let details = load_repository(path).expect("Should load playground");
        println!("Playground branches: {}", details.local_branches.len());
        println!("Playground commits: {}", details.commits.len());
        assert!(details.commits.len() >= 10);
        for b in &details.local_branches {
            println!("  branch: {} (head: {})", b.name, b.is_head);
        }
        for c in &details.commits {
            println!("  commit: {} | {} | files: {}", c.sha, c.msg, c.files.len());
        }
    }
}
