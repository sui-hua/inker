mod git;

use git::branch::{create_branch, delete_branch};
use git::remote::{fetch_remote, merge_branch, pull_remote, push_remote};
use git::repo::{
    checkout_branch, clone_repository, get_commit_diff, get_commits, get_file_diff,
    load_repository, open_folder_dialog,
};
use git::stash::{list_stashes, stash_apply, stash_drop, stash_pop, stash_save};
use git::working::{commit_working_changes, get_working_diff, get_working_status};

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
            clone_repository,
            get_working_status,
            get_working_diff,
            commit_working_changes,
            push_remote,
            pull_remote,
            fetch_remote,
            merge_branch,
            create_branch,
            delete_branch,
            list_stashes,
            stash_save,
            stash_apply,
            stash_pop,
            stash_drop,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
