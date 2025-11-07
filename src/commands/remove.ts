import { detectRepoInfo } from '../repo.ts';
import { loadConfig, expandPath } from '../config.ts';
import { listWorktrees, getWorktreeStatus, removeWorktree } from '../git.ts';
import { error, success, info } from '../ui/theme.ts';
import { confirmRemove } from '../ui/picker.ts';
import type { Worktree } from '../types.ts';

export async function removeCommand(args: { branch: string }) {
  // All parameters required
  const branchArg = args.branch;
  const repoInfo = detectRepoInfo({ cwd: process.cwd() });
  if (!repoInfo) {
    error({ message: 'Not in a git repository' });
    process.exit(1);
  }

  if (!branchArg) {
    error({ message: 'Usage: wt remove <branch>' });
    process.exit(1);
  }

  const config = loadConfig({ cwd: process.cwd() });
  const worktreesRoot = expandPath({ path: config.worktreesRoot || '~/worktrees' });

  // Find the worktree
  const gitWorktrees = listWorktrees({ repoRoot: repoInfo.root });
  const worktree = gitWorktrees.find(wt => wt.branch === branchArg);

  if (!worktree) {
    error({ message: `No worktree found for branch '${branchArg}'` });
    process.exit(1);
  }

  if (worktree.path === repoInfo.root) {
    error({ message: 'Cannot remove the main repository worktree' });
    process.exit(1);
  }

  // Get status and confirm
  const status = getWorktreeStatus({ path: worktree.path });
  const wt: Worktree = {
    path: worktree.path,
    branch: worktree.branch,
    isMain: false,
    status,
  };

  const confirmed = await confirmRemove({ worktree: wt });
  if (!confirmed) {
    info({ message: 'Cancelled' });
    process.exit(0);
  }

  // Remove worktree
  try {
    removeWorktree({ repoRoot: repoInfo.root, path: worktree.path });
    success({ message: `Worktree removed: ${branchArg}` });
  } catch (unknownError) {
    const message = unknownError instanceof Error ? unknownError.message : 'Unknown error';
    error({ message: `Failed to remove worktree: ${message}` });
    process.exit(1);
  }
}
