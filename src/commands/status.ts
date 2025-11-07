import { detectRepoInfo } from '../repo.ts';
import { loadConfig, expandPath } from '../config.ts';
import { listWorktrees, getWorktreeStatus } from '../git.ts';
import { error, info, colorize } from '../ui/theme.ts';
import type { Worktree } from '../types.ts';

export function statusCommand() {
  const repoInfo = detectRepoInfo({ cwd: process.cwd() });
  if (!repoInfo) {
    error({ message: 'Not in a git repository' });
    process.exit(1);
  }

  const config = loadConfig({ cwd: process.cwd() });
  const worktreesRoot = expandPath({ path: config.worktreesRoot || '~/worktrees' });

  // Get all worktrees
  const gitWorktrees = listWorktrees({ repoRoot: repoInfo.root });
  const prWorktrees: Worktree[] = gitWorktrees
    .filter(wt => wt.path !== repoInfo.root && wt.path.startsWith(worktreesRoot))
    .map(wt => {
      const status = getWorktreeStatus({ path: wt.path });
      return {
        path: wt.path,
        branch: wt.branch,
        isMain: false,
        status,
      };
    });

  console.log();
  console.log(colorize({ text: `Repository: ${repoInfo.name}`, color: 'bright' }));
  console.log(colorize({ text: `Location: ${repoInfo.root}`, color: 'dim' }));
  console.log();

  if (prWorktrees.length === 0) {
    console.log(colorize({ text: 'No active worktrees', color: 'dim' }));
    console.log();
    return;
  }

  console.log(colorize({ text: `Active worktrees: ${prWorktrees.length}`, color: 'green' }));
  console.log();

  for (const wt of prWorktrees) {
    const statusParts: string[] = [];

    if (wt.status?.hasChanges) {
      statusParts.push(colorize({ text: 'uncommitted changes', color: 'yellow' }));
    }
    if (wt.status?.ahead) {
      statusParts.push(colorize({ text: `${wt.status.ahead} ahead`, color: 'green' }));
    }
    if (wt.status?.behind) {
      statusParts.push(colorize({ text: `${wt.status.behind} behind`, color: 'red' }));
    }

    const statusStr = statusParts.length > 0 ? ` (${statusParts.join(', ')})` : '';
    console.log(`  ${colorize({ text: '•', color: 'green' })} ${wt.branch}${statusStr}`);
  }

  console.log();
}
