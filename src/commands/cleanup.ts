import { detectRepoInfo } from '../repo.ts';
import { loadConfig, expandPath } from '../config.ts';
import {
  listWorktrees,
  getWorktreeStatusAsync,
  getMergedBranches,
  getDeletedRemoteBranches,
  removeWorktree,
  DEFAULT_BASE_BRANCH,
} from '../git.ts';
import { error, success, info, warning, colorize } from '../ui/theme.ts';
import { confirmCleanup } from '../ui/picker.ts';

export async function cleanupCommand() {
  const repoInfo = detectRepoInfo({ cwd: process.cwd() });
  if (!repoInfo) {
    error({ message: 'Not in a git repository' });
    process.exit(1);
  }

  const config = loadConfig({ cwd: process.cwd() });
  const worktreesRoot = expandPath({ path: config.worktreesRoot || '~/worktrees' });

  info({ message: 'Checking for merged/deleted branches...' });

  // Get merged and deleted branches
  const mergedBranches = getMergedBranches({ repoRoot: repoInfo.root, baseBranch: DEFAULT_BASE_BRANCH });
  const deletedBranches = getDeletedRemoteBranches({ repoRoot: repoInfo.root });
  const toClean = new Set([...mergedBranches, ...deletedBranches]);

  if (toClean.size === 0) {
    success({ message: 'No merged/deleted branches found!' });
    process.exit(0);
  }

  // Find worktrees for these branches
  const gitWorktrees = listWorktrees({ repoRoot: repoInfo.root });
  const worktreesToRemove: Array<{ branch: string; path: string; hasChanges: boolean }> = [];

  await Promise.all(Array.from(toClean).map(async branch => {
    const worktree = gitWorktrees.find(wt => wt.branch === branch && wt.path !== repoInfo.root);
    if (worktree && worktree.path.startsWith(worktreesRoot)) {
      const status = await getWorktreeStatusAsync({ path: worktree.path });
      worktreesToRemove.push({
        branch,
        path: worktree.path,
        hasChanges: status.hasChanges,
      });
    }
  }));

  if (worktreesToRemove.length === 0) {
    success({ message: 'No worktrees to clean up!' });
    process.exit(0);
  }

  // Show list and confirm
  const branchesWithChanges = worktreesToRemove.filter(w => w.hasChanges);
  const branchesToRemove = worktreesToRemove.filter(w => !w.hasChanges);

  if (branchesWithChanges.length > 0) {
    console.log();
    warning({ message: 'Skipping branches with uncommitted changes:' });
    for (const wt of branchesWithChanges) {
      console.log(`  ${colorize({ text: '•', color: 'yellow' })} ${wt.branch}`);
    }
  }

  if (branchesToRemove.length === 0) {
    info({ message: 'All merged/deleted branches have uncommitted changes. Skipping cleanup.' });
    process.exit(0);
  }

  console.log();
  const confirmed = await confirmCleanup({ branches: branchesToRemove.map(w => w.branch) });

  if (!confirmed) {
    info({ message: 'Cancelled' });
    process.exit(0);
  }

  // Remove worktrees
  let removed = 0;
  for (const wt of branchesToRemove) {
    try {
      removeWorktree({ repoRoot: repoInfo.root, path: wt.path });
      info({ message: `Removed: ${wt.branch}` });
      removed++;
    } catch (unknownError) {
      const message = unknownError instanceof Error ? unknownError.message : 'Unknown error';
      warning({ message: `Failed to remove ${wt.branch}: ${message}` });
    }
  }

  console.log();
  success({ message: `🎉 Cleaned up ${removed} worktree${removed !== 1 ? 's' : ''}!` });
}
