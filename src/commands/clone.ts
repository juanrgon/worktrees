import { join, dirname } from 'path';
import { mkdirSync, existsSync, copyFileSync } from 'fs';
import glob from 'fast-glob';
import { detectRepoInfo } from '../repo.ts';
import { loadConfig, expandPath } from '../config.ts';
import { branchExists, createWorktreeFromRemote, fetchRemoteBranch, getRemotes } from '../git.ts';
import { error, success, info, colorize } from '../ui/theme.ts';
import { spawn } from 'child_process';

function parseEditorCommand(args: { editor: string }) {
  const parts = args.editor.trim().split(/\s+/);
  return {
    command: parts[0] || 'code',
    args: parts.slice(1),
  };
}

export async function cloneCommand(args: { branch: string; open: boolean }) {
  // All parameters required
  const initialBranch = args.branch;
  const openRequested = args.open;
  const repoInfo = detectRepoInfo({ cwd: process.cwd() });
  if (!repoInfo) {
    error({ message: 'Not in a git repository' });
    process.exit(1);
  }

  if (!initialBranch.trim()) {
    error({ message: 'Usage: wt clone <branch>' });
    process.exit(1);
  }

  const config = loadConfig({ cwd: process.cwd() });
  const worktreesRoot = expandPath({ path: config.worktreesRoot || '~/worktrees' });

  // Confirm branch selection
  let branch = initialBranch;
  let remote = 'origin';

  // Check if branch argument contains a remote prefix
  const remotes = getRemotes({ cwd: repoInfo.root });
  for (const r of remotes) {
    if (branch.startsWith(`${r}/`)) {
      remote = r;
      branch = branch.substring(r.length + 1);
      break;
    }
  }

  // Fetch the branch first
  info({ message: `Fetching ${remote}/${branch}...` });
  try {
    fetchRemoteBranch({ repoRoot: repoInfo.root, remote, branch });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    error({ message: `Failed to fetch ${remote}/${branch}: ${message}` });
    process.exit(1);
  }

  // Check if branch already exists locally
  if (branchExists({ repoRoot: repoInfo.root, branch })) {
    error({ message: `Branch '${branch}' already exists locally.` });
    console.log(`  • Use ${colorize({ text: `wt new ${branch}`, color: 'cyan' })} to create a worktree from the existing local branch.`);
    process.exit(1);
  }

  // Construct worktree path
  const directoryStructure = config.directoryStructure || 'branch-first';
  const worktreePath =
    directoryStructure === 'repo-first'
      ? join(worktreesRoot, repoInfo.org, repoInfo.name, branch)
      : join(worktreesRoot, branch, repoInfo.org, repoInfo.name);

  if (existsSync(worktreePath)) {
    error({ message: `Worktree already exists: ${worktreePath}` });
    console.log();
    console.log('Options:');
    console.log(`  • ${colorize({ text: 'wt open', color: 'cyan' })}     - Switch to existing worktree`);
    console.log(`  • ${colorize({ text: `wt remove ${branch}`, color: 'cyan' })} - Remove and recreate`);
    process.exit(1);
  }

  // Create parent directories
  mkdirSync(dirname(worktreePath), { recursive: true });

  // Create worktree
  info({ message: `Creating worktree for branch '${branch}'...` });
  try {
    createWorktreeFromRemote({ repoRoot: repoInfo.root, path: worktreePath, branch, remote });
    success({ message: 'Worktree created!' });
    console.log(`📂 ${colorize({ text: worktreePath, color: 'cyan' })}`);
    console.log();

    // Copy configured files
    if (config.copyFiles && config.copyFiles.length > 0) {
      info({ message: 'Copying configured files...' });

      const filesToCopy = await glob(config.copyFiles, {
        cwd: repoInfo.root,
        dot: true,
        onlyFiles: true,
      });

      if (filesToCopy.length === 0) {
        console.log('  • No files matched the configured patterns.');
      }

      for (const file of filesToCopy) {
        const sourcePath = join(repoInfo.root, file);
        const targetPath = join(worktreePath, file);

        try {
          // Ensure target directory exists
          mkdirSync(dirname(targetPath), { recursive: true });
          copyFileSync(sourcePath, targetPath);
          console.log(`  • Copied ${file}`);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          console.log(`  • Failed to copy ${file}: ${message}`);
        }
      }
      console.log();
    }

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
  } catch (unknownError) {
    const message = unknownError instanceof Error ? unknownError.message : 'Unknown error';
    error({ message: `Failed to create worktree: ${message}` });
    process.exit(1);
  }
}
