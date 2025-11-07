import { join } from 'path';
import { mkdirSync, existsSync } from 'fs';
import { detectRepoInfo } from '../repo.ts';
import { loadConfig, expandPath } from '../config.ts';
import { branchExists, createWorktree, getCurrentBranch } from '../git.ts';
import { error, success, info, colorize } from '../ui/theme.ts';
import { promptBranchName, handleExistingBranch } from '../ui/picker.ts';
import { spawn } from 'child_process';

function parseEditorCommand(args: { editor: string }) {
  const parts = args.editor.trim().split(/\s+/);
  return {
    command: parts[0] || 'code',
    args: parts.slice(1),
  };
}

export async function newCommand(args: { branch: string | undefined; open: boolean }) {
  // All parameters required
  const initialBranch = args.branch;
  const openRequested = args.open;
  const repoInfo = detectRepoInfo({ cwd: process.cwd() });
  if (!repoInfo) {
    error({ message: 'Not in a git repository' });
    process.exit(1);
  }

  if (!initialBranch) {
    error({ message: 'Usage: wt new <branch>' });
    process.exit(1);
  }

  const config = loadConfig({ cwd: process.cwd() });
  const worktreesRoot = expandPath({ path: config.worktreesRoot || '~/worktrees' });

  // Get all existing branches
  const currentBranch = getCurrentBranch({ cwd: repoInfo.root });
  const existingBranches = currentBranch ? [currentBranch] : [];

  // Prompt for branch name if not provided
  let branch = initialBranch;

  // Check if branch already exists
  const exists = branchExists({ repoRoot: repoInfo.root, branch });
  let useExisting = false;

  if (exists) {
    const action = await handleExistingBranch({ branch });
    if (action === 'cancel') {
      info({ message: 'Cancelled' });
      process.exit(0);
    }
    useExisting = true;
  }

  // Construct worktree path: ~/worktrees/{branch}/{org}/{repo}
  const worktreePath = join(worktreesRoot, branch, repoInfo.org, repoInfo.name);

  if (existsSync(worktreePath)) {
    error({ message: `Worktree already exists: ${worktreePath}` });
    console.log();
    console.log('Options:');
    console.log(`  • ${colorize({ text: 'wt open', color: 'cyan' })}     - Switch to existing worktree`);
    console.log(`  • ${colorize({ text: `wt remove ${branch}`, color: 'cyan' })} - Remove and recreate`);
    process.exit(1);
  }

  // Create parent directories
  mkdirSync(join(worktreesRoot, branch, repoInfo.org), { recursive: true });

  // Create worktree
  info({ message: `Creating worktree for branch '${branch}'...` });
  try {
    createWorktree({ repoRoot: repoInfo.root, path: worktreePath, branch, existingBranch: useExisting });
    success({ message: 'Worktree created!' });
    console.log(`📂 ${colorize({ text: worktreePath, color: 'cyan' })}`);
    console.log();

    // Handle --open or autoOpen
  const shouldOpen = openRequested || config.autoOpen;
    if (shouldOpen && config.editor) {
      info({ message: `Opening in ${config.editor}...` });
      const editorCommand = parseEditorCommand({ editor: config.editor });
      spawn(editorCommand.command, [...editorCommand.args, worktreePath], {
        detached: true,
        stdio: 'ignore',
      }).unref();
    } else {
      console.log(colorize({ text: `cd ${worktreePath}`, color: 'dim' }));
    }
  } catch (err: any) {
    error({ message: `Failed to create worktree: ${err.message}` });
    process.exit(1);
  }
}
