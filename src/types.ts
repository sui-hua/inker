export interface RepoInfo {
  id: string;
  name: string;
  path: string;
  branch: string;
}

export interface ChangedFile {
  name: string;
  file_type: string;
  additions: number;
  deletions: number;
}

export interface RefTag {
  name: string;
  is_head: boolean;
  is_tag: boolean;
}

export interface CommitItem {
  sha: string;
  full_sha: string;
  msg: string;
  author: string;
  author_email: string;
  date: string;
  parent_shas: string[];
  ref_tags: RefTag[];
  files: ChangedFile[];
  graph_col: number;
}

export interface BranchItem {
  name: string;
  is_head: boolean;
  is_remote: boolean;
  remote: string;
}

export interface RepoDetails {
  repo: RepoInfo;
  local_branches: BranchItem[];
  remote_branches: BranchItem[];
  commits: CommitItem[];
  has_more: boolean;
}

export interface StatusFile {
  path: string;
  status: string;
  staged: boolean;
}

export interface ContextMenuState {
  visible: boolean;
  x: number;
  y: number;
  branchName: string;
  isHead: boolean;
  isRemote: boolean;
}

export interface MergeModalState {
  visible: boolean;
  sourceBranch: string;
  targetBranch: string;
  isSquash: boolean;
  commitMsg: string;
}

export interface CreateBranchModalState {
  visible: boolean;
  baseBranch: string;
  newName: string;
}

export interface StashItem {
  index: number;
  message: string;
  date: string;
  branch: string;
}
