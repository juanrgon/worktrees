import { detectRepoInfo } from '../repo.ts';
import { loadConfig, expandPath } from '../config.ts';
import { listWorktrees, getWorktreeStatus } from '../git.ts';
import { error, info, warning, colorize, formatStatus, runWithLoading } from '../ui/theme.ts';
import { resolveWorktreeSuggestions, printWorktreeSuggestions } from '../ui/suggestions.ts';
import { SUGGESTION_LIMIT_DEFAULT } from '../suggestion-limit.ts';
import type { Worktree } from '../types.ts';

export async function listCommand() {
  const repoInfo = detectRepoInfo({ cwd: process.cwd() });
  if (!repoInfo) {
    error({ message: 'Not in a git repository' });
    process.exit(1);
  }

  const config = loadConfig({ cwd: process.cwd() });
  const worktreesRoot = expandPath({ path: config.worktreesRoot || '~/worktrees' });

  // Get all worktrees
  const gitWorktrees = await runWithLoading({
    message: 'Loading worktrees…',
    task: () => listWorktrees({ repoRoot: repoInfo.root }),
  });

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

  if (worktrees.length === 0) {
    info({ message: 'No worktrees found. Create one with: wt new <branch>' });
    console.log();
  } else {
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

  const localBranches = new Set(worktrees.map(wt => wt.branch));
  const suggestionResult = await runWithLoading({
    message: 'Gathering pull request suggestions…',
    task: () =>
      resolveWorktreeSuggestions({
        repo: repoInfo,
        existingBranches: localBranches,
        limit: config.suggestionLimit ?? SUGGESTION_LIMIT_DEFAULT,
      }),
  });

  switch (suggestionResult.status) {
    case 'unavailable':
      info({ message: 'GitHub CLI not detected; skipping remote pull request lookup.' });
      console.log();
      break;
    case 'error':
      warning({ message: 'Unable to fetch pull requests via GitHub CLI.' });
      console.log();
      break;
    case 'empty':
      if (worktrees.length === 0) {
        info({ message: 'No open pull requests found for your account.' });
        console.log();
      }
      break;
    case 'ok':
      printWorktreeSuggestions({ suggestions: suggestionResult.suggestions });
      break;
  }
}
