import { join, dirname } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { spawn } from 'child_process';
import { detectRepoInfo } from '../repo.ts';
import { loadConfig, expandPath } from '../config.ts';
import {
  listWorktrees,
  getWorktreeStatusAsync,
  branchExists,
  createWorktree,
  createWorktreeFromRemote,
  fetchRemoteBranch,
} from '../git.ts';
import { error, info, warning, success, colorize, runWithLoading } from '../ui/theme.ts';
import { resolveWorktreeSuggestions } from '../ui/suggestions.ts';
import { pickWorktree } from '../ui/picker.ts';
import { SUGGESTION_LIMIT_DEFAULT } from '../suggestion-limit.ts';
import type { Worktree, Config, RepoInfo } from '../types.ts';
import type { WorktreeSuggestion } from '../github.ts';

function parseEditorCommand(args: { editor: string }) {
  const parts = args.editor.trim().split(/\s+/);
  return {
    command: parts[0] || 'code',
    args: parts.slice(1),
  };
}

export async function openCommand(args: { open: boolean; branch?: string }) {
  // All parameters required
  const openRequested = args.open;
  const branch = args.branch;
  const repoInfo = detectRepoInfo({ cwd: process.cwd() });
  if (!repoInfo) {
    error({ message: 'Not in a git repository' });
    process.exit(1);
  }

  const config = loadConfig({ cwd: process.cwd() });
  const worktreesRoot = expandPath({ path: config.worktreesRoot || '~/worktrees' });
  const shouldOpen = openRequested || Boolean(config.autoOpen);

  // Get all worktrees
  const gitWorktrees = await runWithLoading({
    message: 'Loading worktrees…',
    task: () => listWorktrees({ repoRoot: repoInfo.root }),
  });
  const worktrees: Worktree[] = await Promise.all(gitWorktrees.map(async wt => {
    const status = await getWorktreeStatusAsync({ path: wt.path });
    return {
      path: wt.path,
      branch: wt.branch,
      isMain: wt.path === repoInfo.root,
      status,
    };
  }));

  if (branch) {
    const match = worktrees.find(wt => wt.branch === branch);
    if (!match) {
      error({ message: `Worktree for branch '${branch}' not found.` });
      process.exit(1);
    }

    console.log();
    console.log(`📂 ${colorize({ text: match.path, color: 'cyan' })}`);
    console.log();

    openInEditorOrPrint({ path: match.path, shouldOpen, config });
    return;
  }

  const localBranches = new Set(worktrees.map(wt => wt.branch));
  const suggestionLimit = config.suggestionLimit ?? SUGGESTION_LIMIT_DEFAULT;

  const suggestionResult = await runWithLoading({
    message: 'Gathering pull request suggestions…',
    task: () =>
      resolveWorktreeSuggestions({
        repo: repoInfo,
        existingBranches: localBranches,
        limit: suggestionLimit,
      }),
  });

  let suggestions: WorktreeSuggestion[] = [];

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
      suggestions = suggestionResult.suggestions;
      break;
  }

  if (worktrees.length === 0 && suggestions.length === 0) {
    info({ message: 'No worktrees found. Create one with: wt new <branch>' });
    process.exit(0);
  }

  // Show interactive picker
  const selected = await pickWorktree({
    worktrees,
    suggestions,
    options: {
      title: `Worktrees for ${repoInfo.name}`,
    },
  });

  if (!selected) {
    info({ message: 'Cancelled' });
    process.exit(0);
  }

  if (selected.kind === 'suggestion') {
    await handleSuggestionSelection({
      suggestion: selected.suggestion,
      repoInfo,
      config,
      worktreesRoot,
      shouldOpen,
    });
    return;
  }

  const chosen = selected.worktree;

  console.log();
  console.log(`📂 ${colorize({ text: chosen.path, color: 'cyan' })}`);
  console.log();

  openInEditorOrPrint({ path: chosen.path, shouldOpen, config });
}

async function handleSuggestionSelection(args: {
  suggestion: WorktreeSuggestion;
  repoInfo: RepoInfo;
  config: Config;
  worktreesRoot: string;
  shouldOpen: boolean;
}) {
  const branch = args.suggestion.branch;
  const repoInfo = args.repoInfo;
  const config = args.config;
  const worktreesRoot = args.worktreesRoot;
  const shouldOpen = args.shouldOpen;
  
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
    return;
  }

  mkdirSync(dirname(worktreePath), { recursive: true });

  try {
    const branchAlreadyExists = branchExists({ repoRoot: repoInfo.root, branch });

    if (branchAlreadyExists) {
      info({ message: `Creating worktree for existing branch '${branch}'...` });
      createWorktree({
        repoRoot: repoInfo.root,
        path: worktreePath,
        branch,
        existingBranch: true,
      });
    } else {
      info({ message: `Fetching origin/${branch}...` });
      fetchRemoteBranch({ repoRoot: repoInfo.root, remote: 'origin', branch });
      info({ message: `Creating worktree for remote branch '${branch}'...` });
      createWorktreeFromRemote({
        repoRoot: repoInfo.root,
        path: worktreePath,
        branch,
        remote: 'origin',
      });
    }
  } catch (unknownError) {
    const message = unknownError instanceof Error ? unknownError.message : 'Unknown error';
    error({ message: `Failed to create worktree: ${message}` });
    return;
  }

  success({ message: 'Worktree created!' });
  console.log(`📂 ${colorize({ text: worktreePath, color: 'cyan' })}`);
  console.log();

  openInEditorOrPrint({ path: worktreePath, shouldOpen, config });
}

function openInEditorOrPrint(args: {
  path: string;
  shouldOpen: boolean;
  config: Config;
}) {
  const { path, shouldOpen, config } = args;
  if (shouldOpen && config.editor) {
    info({ message: `Opening in ${config.editor}...` });
    const editorCommand = parseEditorCommand({ editor: config.editor });
    spawn(editorCommand.command, [...editorCommand.args, path], {
      detached: true,
      stdio: 'ignore',
    }).unref();
  } else {
    console.log(colorize({ text: `cd ${path}`, color: 'dim' }));
  }
}
