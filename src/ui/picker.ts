import * as clack from '@clack/prompts';
import type { Worktree } from '../types.ts';
import type { WorktreeSuggestion } from '../github.ts';
import { colorize, formatStatus, formatPath } from './theme.ts';

const PICKER_PATH_MAX_LENGTH = 40 as const;

export type PickerOptions = {
  title?: string;
  placeholder?: string;
  currentBranch?: string;
};

export type WorktreeSelection =
  | { kind: 'worktree'; worktree: Worktree }
  | { kind: 'suggestion'; suggestion: WorktreeSuggestion };

export async function pickWorktree(args: {
  worktrees: Worktree[];
  suggestions: WorktreeSuggestion[];
  options: PickerOptions;
}) {
  const worktrees = args.worktrees;
  const suggestions = args.suggestions;
  const options = args.options;
  if (worktrees.length === 0 && suggestions.length === 0) {
    return null;
  }

  const worktreeChoices = worktrees.map(wt => {
    const selection = { kind: 'worktree', worktree: wt } as const;
    const statusStr = wt.status ? formatStatus({ status: wt.status }) : '';
    const marker = wt.branch === options.currentBranch ? colorize({ text: '→', color: 'cyan' }) : ' ';
    const branchColor = wt.isMain ? 'cyan' : 'green';
    const pathStr = colorize({ text: formatPath({ path: wt.path, maxLength: PICKER_PATH_MAX_LENGTH }), color: 'dim' });

    return {
      value: selection,
      label: `${marker} ${colorize({ text: wt.branch, color: branchColor })} ${statusStr}`,
      hint: pathStr,
    };
  });

  const suggestionChoices = suggestions.map(suggestion => {
    const selection = { kind: 'suggestion', suggestion } as const;
    const marker = colorize({ text: '+', color: 'green' });
    const branchColor = suggestion.isDraft ? 'yellow' : 'magenta';
    const branchLabel = colorize({ text: suggestion.branch, color: branchColor });
    const draftLabel = suggestion.isDraft ? colorize({ text: ' (draft)', color: 'dim' }) : '';
    const prNumber = colorize({ text: `#${suggestion.number}`, color: 'cyan' });
    const hint = suggestion.title
      ? colorize({ text: suggestion.title, color: 'dim' })
      : suggestion.url
        ? colorize({ text: suggestion.url, color: 'dim' })
        : colorize({ text: 'Remote branch', color: 'dim' });

    return {
      value: selection,
      label: `${marker} ${branchLabel}${draftLabel} ${prNumber}`,
      hint,
    };
  });

  const choices = [...worktreeChoices, ...suggestionChoices];

  const selected = await clack.select({
    message: options.title || 'Select a worktree',
    options: choices,
  });

  if (clack.isCancel(selected)) {
    return null;
  }

  if (isWorktreeSelection(selected)) {
    return selected;
  }

  return null;
}

export async function confirmRemove(args: { worktree: Worktree }) {
  const worktree = args.worktree;
  const status = worktree.status;
  const hasChanges = status?.hasChanges || false;

  const lines = [
    `Branch: ${colorize({ text: worktree.branch, color: 'cyan' })}`,
    `Path: ${colorize({ text: worktree.path, color: 'dim' })}`,
  ];

  if (status) {
    const statusParts: string[] = [];
    if (status.modified) statusParts.push(`${status.modified} modified`);
    if (status.untracked) statusParts.push(`${status.untracked} untracked`);
    if (status.ahead) statusParts.push(`${status.ahead} ahead`);
    if (status.behind) statusParts.push(`${status.behind} behind`);

    if (statusParts.length > 0) {
      lines.push(`Status: ${statusParts.join(', ')}`);
    }
  }

  if (hasChanges) {
    lines.push('');
    lines.push(colorize({ text: '⚠️  You have uncommitted changes!', color: 'yellow' }));
  }

  console.log('\n' + lines.join('\n') + '\n');

  const confirmed = await clack.confirm({
    message: 'Are you sure you want to remove this worktree?',
    initialValue: !hasChanges,
  });

  return confirmed === true;
}

export async function confirmCleanup(args: { branches: string[] }) {
  const branches = args.branches;
  console.log('\nFound merged/deleted branches:');
  for (const branch of branches) {
    console.log(`  ${colorize({ text: '•', color: 'dim' })} ${branch}`);
  }
  console.log();

  const confirmed = await clack.confirm({
    message: `Remove ${branches.length} worktree${branches.length > 1 ? 's' : ''}?`,
    initialValue: true,
  });

  return confirmed === true;
}

export async function promptBranchName(args: { existingNames: string[] }) {
  const existingNames = args.existingNames;
  const result = await clack.text({
    message: 'Branch name:',
    placeholder: 'feature-name',
    validate: value => {
      if (!value || value.trim().length === 0) {
        return 'Branch name is required';
      }
      if (existingNames.includes(value.trim())) {
        return `Branch "${value.trim()}" already exists`;
      }
      // Basic git branch name validation
      if (value.includes('..') || value.includes(' ') || value.startsWith('-')) {
        return 'Invalid branch name';
      }
      return undefined;
    },
  });

  if (clack.isCancel(result)) {
    return null;
  }

  return result.toString().trim();
}

export async function handleExistingBranch(args: { branch: string }) {
  const branch = args.branch;
  const action = await clack.select({
    message: `Branch "${branch}" already exists.`,
    options: [
      { value: 'create', label: 'Create worktree from existing branch' },
      { value: 'cancel', label: 'Cancel' },
    ],
  });

  if (clack.isCancel(action)) {
    return 'cancel';
  }

  return action === 'create' || action === 'cancel' ? action : 'cancel';
}

const isWorktreeSelection = (value: unknown): value is WorktreeSelection => {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const kind = Reflect.get(value, 'kind');
  return kind === 'worktree' || kind === 'suggestion';
};
