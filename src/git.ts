import { execSync } from 'child_process';

type GitWorktree = {
  path: string;
  branch: string;
  head: string;
};

type WorktreeStatusSummary = {
  ahead: number;
  behind: number;
  hasChanges: boolean;
  modified: number;
  untracked: number;
};

export function exec(args: { command: string; cwd: string; silent: boolean }) {
  const command = args.command;
  const cwd = args.cwd;
  const silent = args.silent;

  try {
    return execSync(command, {
      cwd,
      encoding: 'utf8',
      stdio: silent ? 'pipe' : 'inherit',
    }).trim();
  } catch (error) {
    if (silent) {
      return '';
    }
    throw error;
  }
}

export function execQuiet(args: { command: string; cwd: string }) {
  return exec({ command: args.command, cwd: args.cwd, silent: true });
}

export function isGitRepo(args: { cwd: string }) {
  const result = execQuiet({ command: 'git rev-parse --is-inside-work-tree', cwd: args.cwd });
  return result === 'true';
}

export function getGitRoot(args: { cwd: string }) {
  return execQuiet({ command: 'git rev-parse --show-toplevel', cwd: args.cwd });
}

export function getRemoteUrl(args: { cwd: string }) {
  return execQuiet({ command: 'git remote get-url origin', cwd: args.cwd });
}

export function getCurrentBranch(args: { cwd: string }) {
  return execQuiet({ command: 'git branch --show-current', cwd: args.cwd });
}

export function listWorktrees(args: { repoRoot: string }) {
  const repoRoot = args.repoRoot;
  const output = execQuiet({ command: 'git worktree list --porcelain', cwd: repoRoot });
  const worktrees: GitWorktree[] = [];

  const lines = output.split('\n');
  let current: Partial<GitWorktree> = {};

  for (const line of lines) {
    if (line.startsWith('worktree ')) {
      current.path = line.substring(9);
    } else if (line.startsWith('branch ')) {
      current.branch = line.substring(7).replace('refs/heads/', '');
    } else if (line.startsWith('HEAD ')) {
      current.head = line.substring(5);
    } else if (line === '') {
      if (current.path) {
        worktrees.push({
          path: current.path,
          branch: current.branch || '(detached)',
          head: current.head || '',
        });
      }
      current = {};
    }
  }

  if (current.path) {
    worktrees.push({
      path: current.path,
      branch: current.branch || '(detached)',
      head: current.head || '',
    });
  }

  return worktrees;
}

export function getWorktreeStatus(args: { path: string }) {
  const worktreePath = args.path;
  const statusOutput = execQuiet({ command: 'git status --porcelain', cwd: worktreePath });
  const lines = statusOutput.split('\n').filter(line => line);
  const modified = lines.filter(line => line.startsWith(' M') || line.startsWith('M ')).length;
  const untracked = lines.filter(line => line.startsWith('??')).length;
  const hasChanges = lines.length > 0;

  const branch = getCurrentBranch({ cwd: worktreePath });
  if (!branch || branch === '(detached)') {
    return { ahead: 0, behind: 0, hasChanges, modified, untracked };
  }

  const remoteBranch = execQuiet({
    command: `git rev-parse --abbrev-ref ${branch}@{upstream} 2>/dev/null`,
    cwd: worktreePath,
  });

  let ahead = 0;
  let behind = 0;

  if (remoteBranch) {
    const aheadBehind = execQuiet({
      command: `git rev-list --left-right --count ${branch}...${remoteBranch}`,
      cwd: worktreePath,
    });
    const parts = aheadBehind.split('\t');
    if (parts.length === 2) {
      ahead = parseInt(parts[0] || '0', 10);
      behind = parseInt(parts[1] || '0', 10);
    }
  }

  return { ahead, behind, hasChanges, modified, untracked };
}

export function createWorktree(args: { repoRoot: string; path: string; branch: string; existingBranch: boolean }) {
  const repoRoot = args.repoRoot;
  const worktreePath = args.path;
  const branch = args.branch;
  const existingBranch = args.existingBranch;
  const command = existingBranch
    ? `git worktree add "${worktreePath}" "${branch}"`
    : `git worktree add "${worktreePath}" -b "${branch}"`;

  exec({ command, cwd: repoRoot, silent: false });
}

export function removeWorktree(args: { repoRoot: string; path: string }) {
  exec({ command: `git worktree remove "${args.path}"`, cwd: args.repoRoot, silent: false });
}

export function branchExists(args: { repoRoot: string; branch: string }) {
  const result = execQuiet({ command: `git rev-parse --verify ${args.branch} 2>/dev/null`, cwd: args.repoRoot });
  return result.length > 0;
}

export const DEFAULT_BASE_BRANCH = 'main' as const;

export function getMergedBranches(args: { repoRoot: string; baseBranch: string }) {
  const repoRoot = args.repoRoot;
  const baseBranch = args.baseBranch;
  const output = execQuiet({ command: `git branch --merged ${baseBranch}`, cwd: repoRoot });
  return output
    .split('\n')
    .map(branch => branch.trim().replace(/^\*\s+/, ''))
    .filter(branch => branch && branch !== baseBranch && branch !== 'master');
}

export function getDeletedRemoteBranches(args: { repoRoot: string }) {
  const repoRoot = args.repoRoot;
  execQuiet({ command: 'git fetch --prune 2>/dev/null', cwd: repoRoot });

  const remoteBranches = execQuiet({ command: 'git branch -r', cwd: repoRoot })
    .split('\n')
    .map(branch => branch.trim())
    .filter(branch => branch && !branch.includes('HEAD'))
    .map(branch => branch.replace('origin/', ''));

  const localBranches = execQuiet({ command: 'git branch', cwd: repoRoot })
    .split('\n')
    .map(branch => branch.trim().replace(/^\*\s+/, ''))
    .filter(branch => branch);

  return localBranches.filter(local => !remoteBranches.includes(local));
}
