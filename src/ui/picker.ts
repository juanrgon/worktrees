import * as clack from '@clack/prompts';
import type { Worktree } from '../types.ts';
import { colorize, formatStatus, formatPath } from './theme.ts';

const PICKER_PATH_MAX_LENGTH = 40 as const;

export type PickerOptions = {
  title?: string;
  placeholder?: string;
  currentBranch?: string;
};

export async function pickWorktree(args: { worktrees: Worktree[]; options: PickerOptions }) {
  const worktrees = args.worktrees;
  const options = args.options;
  if (worktrees.length === 0) {
    return null;
  }

  const choices = worktrees.map(wt => {
    const statusStr = wt.status ? formatStatus({ status: wt.status }) : '';
    const marker = wt.branch === options.currentBranch ? colorize({ text: '→', color: 'cyan' }) : ' ';
    const branchColor = wt.isMain ? 'cyan' : 'green';
    const pathStr = colorize({ text: formatPath({ path: wt.path, maxLength: PICKER_PATH_MAX_LENGTH }), color: 'dim' });

    return {
      value: wt,
      label: `${marker} ${colorize({ text: wt.branch, color: branchColor })} ${statusStr}`,
      hint: pathStr,
    };
  });

  const selected = await clack.select({
    message: options.title || 'Select a worktree',
    options: choices,
  });

  if (clack.isCancel(selected)) {
    return null;
  }

  if (isWorktree(selected)) {
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

const isWorktree = (value: unknown): value is Worktree =>
  typeof value === 'object' && value !== null && 'path' in value && 'branch' in value;
