use serde::{Deserialize, Serialize};
use std::path::Path;

use super::utils::{clean_git_path, run_git_in};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct StatusFile {
    pub path: String,
    pub status: String,
    pub staged: bool,
}

#[tauri::command]
pub fn get_working_status(repo_path: String) -> Result<Vec<StatusFile>, String> {
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
            // 未追踪文件
            files.push(StatusFile {
                path: clean_path,
                status: "?".to_string(),
                staged: false,
            });
        } else {
            // 已暂存的改动
            if index_status != " " && index_status != "?" {
                files.push(StatusFile {
                    path: clean_path.clone(),
                    status: index_status.to_string(),
                    staged: true,
                });
            }
            // 未暂存的改动（工作区）
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
pub fn get_working_diff(
    repo_path: String,
    file_path: String,
    staged: bool,
) -> Result<String, String> {
    let clean = clean_git_path(&file_path);
    if staged {
        run_git_in(&repo_path, &["diff", "--cached", "--color=never", "--", &clean])
    } else {
        let diff = run_git_in(&repo_path, &["diff", "--color=never", "--", &clean])?;
        if diff.trim().is_empty() {
            // 未追踪的新文件：读取文件内容生成伪 diff
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
pub fn commit_working_changes(
    repo_path: String,
    message: String,
    files: Vec<String>,     // 所有选中文件路径
    staged_files: Vec<String>, // 其中已在暂存区的文件路径
) -> Result<String, String> {
    let trimmed = message.trim();
    if trimmed.is_empty() {
        return Err("提交信息不能为空".into());
    }
    if files.is_empty() {
        return Err("没有选中任何文件".into());
    }

    // 只对尚未暂存的文件执行 git add
    let staged_set: std::collections::HashSet<&str> =
        staged_files.iter().map(|s| s.as_str()).collect();

    for f in &files {
        let clean = clean_git_path(f);
        if !staged_set.contains(f.as_str()) {
            // 未暂存：先 add
            run_git_in(&repo_path, &["add", "--", &clean])?;
        }
    }

    run_git_in(&repo_path, &["commit", "-m", trimmed])
}
