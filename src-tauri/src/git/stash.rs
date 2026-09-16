use serde::{Deserialize, Serialize};

use super::utils::run_git_in;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct StashItem {
    pub index: usize,
    pub message: String,
    pub date: String,
    pub branch: String,
}

#[tauri::command]
pub fn list_stashes(repo_path: String) -> Result<Vec<StashItem>, String> {
    // format: index<TAB>date<TAB>branch<TAB>message
    let output = run_git_in(
        &repo_path,
        &[
            "stash",
            "list",
            "--format=%gd%x09%ci%x09%gs",
        ],
    )
    .unwrap_or_default();

    let mut items = Vec::new();
    for line in output.lines() {
        let parts: Vec<&str> = line.splitn(3, '\t').collect();
        if parts.len() < 3 {
            continue;
        }
        // parts[0] = "stash@{0}", parts[1] = datetime, parts[2] = "WIP on main: abc msg"
        let raw_index = parts[0].trim(); // stash@{N}
        let index: usize = raw_index
            .trim_start_matches("stash@{")
            .trim_end_matches('}')
            .parse()
            .unwrap_or(0);

        let date = parts[1].trim().get(..16).unwrap_or(parts[1].trim()).to_string();

        // "WIP on <branch>: <short_sha> <message>"  or  "On <branch>: <message>"
        let gs = parts[2].trim();
        let (branch, message) = if let Some(rest) = gs.strip_prefix("WIP on ") {
            if let Some(colon) = rest.find(':') {
                let b = rest[..colon].trim().to_string();
                let m = rest[colon + 1..].trim().to_string();
                (b, m)
            } else {
                ("".to_string(), rest.to_string())
            }
        } else if let Some(rest) = gs.strip_prefix("On ") {
            if let Some(colon) = rest.find(':') {
                let b = rest[..colon].trim().to_string();
                let m = rest[colon + 1..].trim().to_string();
                (b, m)
            } else {
                ("".to_string(), rest.to_string())
            }
        } else {
            ("".to_string(), gs.to_string())
        };

        items.push(StashItem {
            index,
            message,
            date,
            branch,
        });
    }

    Ok(items)
}

#[tauri::command]
pub fn stash_save(repo_path: String, message: Option<String>) -> Result<String, String> {
    if let Some(msg) = message.filter(|m| !m.trim().is_empty()) {
        run_git_in(&repo_path, &["stash", "push", "-m", msg.trim()])
    } else {
        run_git_in(&repo_path, &["stash", "push"])
    }
}

#[tauri::command]
pub fn stash_apply(repo_path: String, index: usize) -> Result<String, String> {
    let ref_str = format!("stash@{{{}}}", index);
    run_git_in(&repo_path, &["stash", "apply", &ref_str])
}

#[tauri::command]
pub fn stash_pop(repo_path: String, index: usize) -> Result<String, String> {
    let ref_str = format!("stash@{{{}}}", index);
    run_git_in(&repo_path, &["stash", "pop", &ref_str])
}

#[tauri::command]
pub fn stash_drop(repo_path: String, index: usize) -> Result<String, String> {
    let ref_str = format!("stash@{{{}}}", index);
    run_git_in(&repo_path, &["stash", "drop", &ref_str])
}
