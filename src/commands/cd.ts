import { statSync } from 'fs';
import { spawnSync } from 'child_process';
import { detectRepoInfo } from '../repo.ts';
import { listWorktrees } from '../git.ts';

export async function cdCommand(args: { branch: string | undefined }) {
  const repoInfo = detectRepoInfo({ cwd: process.cwd() });
  if (!repoInfo) {
    console.error('Not in a git repository');
    process.exit(1);
  }

  const gitWorktrees = listWorktrees({ repoRoot: repoInfo.root });

  // If branch is provided, find and output the path directly
  if (args.branch) {
    const match = gitWorktrees.find(wt => wt.branch === args.branch);
    if (!match) {
      console.error(`Worktree for branch '${args.branch}' not found.`);
      process.exit(1);
    }
    console.log(match.path);
    return;
  }

  // No branch provided - use fzf to select
  if (gitWorktrees.length === 0) {
    console.error('No worktrees found.');
    process.exit(1);
  }

  // Sort by mtime (most recently modified first)
  const worktreesWithMtime = gitWorktrees.map(wt => {
    try {
      const stat = statSync(wt.path);
      return { ...wt, mtime: stat.mtimeMs };
    } catch {
      return { ...wt, mtime: 0 };
    }
  });
  worktreesWithMtime.sort((a, b) => b.mtime - a.mtime);

  // Format for fzf: "branch\tpath" so we can display branch but extract path
  const fzfInput = worktreesWithMtime
    .map(wt => `${wt.branch}\t${wt.path}`)
    .join('\n');

  const result = spawnSync('fzf', ['--with-nth=1', '--delimiter=\t', '--height=~50%', '--reverse'], {
    input: fzfInput,
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'inherit'],
  });

  if (result.status !== 0 || !result.stdout) {
    // User cancelled or fzf not found
    process.exit(1);
  }

  const selected = result.stdout.trim();
  const selectedPath = selected.split('\t')[1];

  if (selectedPath) {
    console.log(selectedPath);
  }
}
