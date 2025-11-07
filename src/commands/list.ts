import { detectRepoInfo } from '../repo.ts';
import { loadConfig, expandPath } from '../config.ts';
import { listWorktrees, getWorktreeStatus } from '../git.ts';
import { error, info, colorize, formatStatus } from '../ui/theme.ts';
import type { Worktree } from '../types.ts';

export function listCommand() {
  const repoInfo = detectRepoInfo({ cwd: process.cwd() });
  if (!repoInfo) {
    error({ message: 'Not in a git repository' });
    process.exit(1);
  }

  const config = loadConfig({ cwd: process.cwd() });
  const worktreesRoot = expandPath({ path: config.worktreesRoot || '~/worktrees' });

  // Get all worktrees
  const gitWorktrees = listWorktrees({ repoRoot: repoInfo.root });

  if (gitWorktrees.length === 0) {
    info({ message: 'No worktrees found. Create one with: wt new <branch>' });
    process.exit(0);
  }

  const worktrees: Worktree[] = gitWorktrees.map(wt => {
    const status = getWorktreeStatus({ path: wt.path });
    return {
      path: wt.path,
      branch: wt.branch,
      isMain: wt.path === repoInfo.root,
      status,
    };
  });

  console.log();
  console.log(colorize({ text: `Worktrees for ${repoInfo.name}:`, color: 'bright' }));
  console.log();

  for (const wt of worktrees) {
    const isInWorktreesDir = wt.path.startsWith(worktreesRoot);
    const statusStr = wt.status ? formatStatus({ status: wt.status }) : '';
    const marker = wt.isMain ? colorize({ text: '→', color: 'cyan' }) : ' ';
    const branchColor = wt.isMain ? 'cyan' : isInWorktreesDir ? 'green' : 'dim';

    console.log(`${marker} ${colorize({ text: wt.branch, color: branchColor })} ${statusStr}`);
    console.log(`  ${colorize({ text: wt.path, color: 'dim' })}`);
    console.log();
  }

  console.log(colorize({ text: 'Legend: → current  ● changes  ↑ ahead  ↓ behind', color: 'dim' }));
  console.log();
}
