import { join, dirname, relative } from 'path';
import { mkdirSync, existsSync, rmdirSync } from 'fs';
import { detectRepoInfo } from '../repo.ts';
import { loadConfig, expandPath } from '../config.ts';
import { listWorktrees, moveWorktree } from '../git.ts';
import { error, success, info, colorize } from '../ui/theme.ts';

export async function migrateCommand() {
  const repoInfo = detectRepoInfo({ cwd: process.cwd() });
  if (!repoInfo) {
    error({ message: 'Not in a git repository' });
    process.exit(1);
  }

  const config = loadConfig({ cwd: process.cwd() });
  const worktreesRoot = expandPath({ path: config.worktreesRoot || '~/worktrees' });
  const directoryStructure = config.directoryStructure || 'branch-first';

  info({ message: `Migrating worktrees to '${directoryStructure}' structure...` });

  const gitWorktrees = listWorktrees({ repoRoot: repoInfo.root });
  let movedCount = 0;

  for (const wt of gitWorktrees) {
    // Skip main worktree
    if (wt.path === repoInfo.root) continue;

    // Skip worktrees outside of worktreesRoot
    if (!wt.path.startsWith(worktreesRoot)) continue;

    const branch = wt.branch;
    const expectedPath =
      directoryStructure === 'repo-first'
        ? join(worktreesRoot, repoInfo.org, repoInfo.name, branch)
        : join(worktreesRoot, branch, repoInfo.org, repoInfo.name);

    if (wt.path !== expectedPath) {
      if (existsSync(expectedPath)) {
        info({ message: `Skipping ${branch}: Destination already exists (${expectedPath})` });
        continue;
      }

      info({ message: `Moving ${branch}...` });
      
      try {
        // Create parent directory
        mkdirSync(dirname(expectedPath), { recursive: true });

        // Move worktree
        moveWorktree({ oldPath: wt.path, newPath: expectedPath });
        
        console.log(`  ${colorize({ text: wt.path, color: 'dim' })} -> ${colorize({ text: expectedPath, color: 'green' })}`);
        movedCount++;

        // Try to clean up old directories
        tryCleanupEmptyDirs({ path: dirname(wt.path), root: worktreesRoot });

      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        error({ message: `Failed to move ${branch}: ${message}` });
      }
    }
  }

  if (movedCount === 0) {
    info({ message: 'No worktrees needed migration.' });
  } else {
    success({ message: `Successfully migrated ${movedCount} worktrees.` });
  }
}

function tryCleanupEmptyDirs(args: { path: string; root: string }) {
  let current = args.path;
  const root = args.root;

  while (current !== root && current.startsWith(root)) {
    try {
      rmdirSync(current);
      current = dirname(current);
    } catch (e) {
      // Directory not empty or other error, stop cleaning up
      break;
    }
  }
}
