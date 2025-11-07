import { detectRepoInfo } from '../repo.ts';
import { loadConfig, expandPath } from '../config.ts';
import { listWorktrees, getWorktreeStatus } from '../git.ts';
import { error, info, colorize } from '../ui/theme.ts';
import { pickWorktree } from '../ui/picker.ts';
import type { Worktree } from '../types.ts';
import { spawn } from 'child_process';

function parseEditorCommand(args: { editor: string }) {
  const parts = args.editor.trim().split(/\s+/);
  return {
    command: parts[0] || 'code',
    args: parts.slice(1),
  };
}

export async function openCommand(args: { open: boolean }) {
  // All parameters required
  const openRequested = args.open;
  const repoInfo = detectRepoInfo({ cwd: process.cwd() });
  if (!repoInfo) {
    error({ message: 'Not in a git repository' });
    process.exit(1);
  }

  const config = loadConfig({ cwd: process.cwd() });
  const worktreesRoot = expandPath({ path: config.worktreesRoot || '~/worktrees' });

  // Get all worktrees
  const gitWorktrees = listWorktrees({ repoRoot: repoInfo.root });
  const worktrees: Worktree[] = gitWorktrees.map(wt => {
    const status = getWorktreeStatus({ path: wt.path });
    return {
      path: wt.path,
      branch: wt.branch,
      isMain: wt.path === repoInfo.root,
      status,
    };
  });

  if (worktrees.length === 0) {
    info({ message: 'No worktrees found. Create one with: wt new <branch>' });
    process.exit(0);
  }

  // Show interactive picker
  const selected = await pickWorktree({
    worktrees,
    options: {
      title: `Worktrees for ${repoInfo.name}`,
    },
  });

  if (!selected) {
    info({ message: 'Cancelled' });
    process.exit(0);
  }

  console.log();
  console.log(`📂 ${colorize({ text: selected.path, color: 'cyan' })}`);
  console.log();

  // Handle --open or autoOpen
  const shouldOpen = openRequested || config.autoOpen;
  if (shouldOpen && config.editor) {
    info({ message: `Opening in ${config.editor}...` });
    const editorCommand = parseEditorCommand({ editor: config.editor });
    spawn(editorCommand.command, [...editorCommand.args, selected.path], {
      detached: true,
      stdio: 'ignore',
    }).unref();
  } else {
    console.log(colorize({ text: `cd ${selected.path}`, color: 'dim' }));
  }
}
