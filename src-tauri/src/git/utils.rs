use std::path::Path;
use std::process::Command;

#[cfg(windows)]
use std::os::windows::process::CommandExt;

#[cfg(windows)]
pub const CREATE_NO_WINDOW: u32 = 0x08000000;

pub fn create_git_command() -> Command {
    let mut cmd = Command::new("git");
    #[cfg(windows)]
    cmd.creation_flags(CREATE_NO_WINDOW);
    cmd
}

pub fn run_git_in(repo_path: &str, args: &[&str]) -> Result<String, String> {
    let mut full_args = vec![
        "-c",
        "core.quotepath=false",
        "-c",
        "i18n.logOutputEncoding=utf-8",
        "-c",
        "i18n.commitEncoding=utf-8",
    ];
    full_args.extend_from_slice(args);

    let output = create_git_command()
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

pub fn clean_git_path(raw: &str) -> String {
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

pub fn determine_file_type(filename: &str) -> String {
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
