export type Config = {
  editor?: string;
  worktreesRoot?: string;
  autoOpen?: boolean;
  repoName?: string;
};

export type RepoInfo = {
  /** Absolute path to the git root */
  root: string;
  /** Organization/owner name (e.g., "github") */
  org: string;
  /** Repository name (e.g., "copilot-api") */
  name: string;
  /** Full identifier (e.g., "github/copilot-api") */
  fullName: string;
};

export type Worktree = {
  /** Absolute path to the worktree */
  path: string;
  /** Branch name */
  branch: string;
  /** Is this the main repo worktree? */
  isMain: boolean;
  /** Status information */
  status?: WorktreeStatus;
};

export type WorktreeStatus = {
  /** Number of commits ahead of remote */
  ahead: number;
  /** Number of commits behind remote */
  behind: number;
  /** Has uncommitted changes */
  hasChanges: boolean;
  /** Number of modified files */
  modified?: number;
  /** Number of untracked files */
  untracked?: number;
};

export type ConfigSource = {
  path: string;
  type: 'default' | 'global' | 'local' | 'flag';
};

export type ResolvedConfig = Config & {
  sources: Partial<Record<keyof Config, ConfigSource>>;
};
