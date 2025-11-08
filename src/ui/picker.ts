import * as clack from '@clack/prompts';
import { clearLine, cursorTo, moveCursor } from 'node:readline';
import fuzzysort from 'fuzzysort';
import type { Worktree } from '../types.ts';
import type { WorktreeSuggestion } from '../github.ts';
import { colorize, formatStatus, formatPath } from './theme.ts';

const MAX_VISIBLE_ITEMS = 12;
const PICKER_PATH_MAX_LENGTH = 64;

export type PickerOptions = {
  title?: string;
  placeholder?: string;
  currentBranch?: string;
};

export type WorktreeSelection =
  | { kind: 'worktree'; worktree: Worktree }
  | { kind: 'suggestion'; suggestion: WorktreeSuggestion };

type PickerItem =
  | {
      kind: 'worktree';
      worktree: Worktree;
      branch: string;
      path: string;
      title: string;
      number: string;
      url: string;
      searchText: string;
    }
  | {
      kind: 'suggestion';
      suggestion: WorktreeSuggestion;
      branch: string;
      path: string;
      title: string;
      number: string;
      url: string;
      searchText: string;
    };

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
  if (!process.stdin.isTTY || !process.stdout.isTTY || typeof process.stdin.setRawMode !== 'function') {
    return fallbackPickWorktree({ worktrees, suggestions, options });
  }

  const items = buildPickerItems({ worktrees, suggestions });
  const liveSelection = await runLivePicker({ items, options });
  if (liveSelection) {
    return liveSelection;
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

async function fallbackPickWorktree(args: {
  worktrees: Worktree[];
  suggestions: WorktreeSuggestion[];
  options: PickerOptions;
}) {
  const options = args.options;
  const worktreeChoices = args.worktrees.map(worktree => {
    const selection = { kind: 'worktree', worktree } as const;
    const display = formatWorktreeDisplay({ worktree, currentBranch: options.currentBranch });
    return {
      value: selection,
      label: display.label,
      hint: display.hint,
    };
  });

  const suggestionChoices = args.suggestions.map(suggestion => {
    const selection = { kind: 'suggestion', suggestion } as const;
    const display = formatSuggestionDisplay({ suggestion });
    return {
      value: selection,
      label: display.label,
      hint: display.hint,
    };
  });

  const choiceList = [...worktreeChoices, ...suggestionChoices];

  const selected = await clack.select({
    message: options.title || 'Select a worktree',
    options: choiceList,
  });

  if (clack.isCancel(selected)) {
    return null;
  }

  if (isWorktreeSelection(selected)) {
    return selected;
  }

  return null;
}

function buildPickerItems(args: { worktrees: Worktree[]; suggestions: WorktreeSuggestion[] }) {
  const items: PickerItem[] = [];

  for (const worktree of args.worktrees) {
    items.push({
      kind: 'worktree',
      worktree,
      branch: worktree.branch,
      path: worktree.path,
      title: '',
      number: '',
      url: '',
      searchText: `${worktree.branch} ${worktree.path}`,
    });
  }

  for (const suggestion of args.suggestions) {
    items.push({
      kind: 'suggestion',
      suggestion,
      branch: suggestion.branch,
      path: '',
      title: suggestion.title ?? '',
      number: `#${suggestion.number}`,
      url: suggestion.url ?? '',
      searchText: `${suggestion.branch} ${suggestion.title ?? ''} #${suggestion.number} ${suggestion.url ?? ''}`,
    });
  }

  return items;
}

async function runLivePicker(args: { items: PickerItem[]; options: PickerOptions }) {
  const stdin = process.stdin as NodeJS.ReadStream & { isRaw?: boolean };
  const stdout = process.stdout;
  const originalRawMode = stdin.isRaw === true;
  const restoreCursor = () => stdout.write('\x1b[?25h');

  return new Promise<WorktreeSelection | null>(resolve => {
    let searchQuery = '';
    let filteredItems = args.items;
    let selectionIndex = filteredItems.length > 0 ? 0 : -1;
    let lastRenderLineCount = 0;

    const updateFilteredItems = () => {
      if (searchQuery.trim().length === 0) {
        filteredItems = args.items;
      } else {
        filteredItems = fuzzysort
          .go<PickerItem>(searchQuery, args.items, {
            keys: ['searchText', 'branch', 'path', 'title', 'number', 'url'],
            all: true,
          })
          .map(result => result.obj);
      }

      if (filteredItems.length === 0) {
        selectionIndex = -1;
      } else if (selectionIndex === -1) {
        selectionIndex = 0;
      } else if (selectionIndex >= filteredItems.length) {
        selectionIndex = filteredItems.length - 1;
      }
    };

    const clearPreviousLines = () => {
      if (lastRenderLineCount === 0) {
        return;
      }

      moveCursor(stdout, 0, -lastRenderLineCount);
      for (let index = 0; index < lastRenderLineCount; index += 1) {
        clearLine(stdout, 0);
        moveCursor(stdout, 0, 1);
      }
      moveCursor(stdout, 0, -lastRenderLineCount);
      cursorTo(stdout, 0);
    };

    const render = () => {
      clearPreviousLines();

      const lines: string[] = [];
      const title = args.options.title || 'Select a worktree';
      lines.push(colorize({ text: title, color: 'bright' }));
      lines.push(colorize({ text: 'Type to filter • ↑/↓ move • Enter select • Esc cancel', color: 'dim' }));
      const queryDisplay = searchQuery ? colorize({ text: searchQuery, color: 'magenta' }) : colorize({ text: '∅', color: 'dim' });
      lines.push(`Search: ${queryDisplay}`);
      lines.push('');

      if (filteredItems.length === 0) {
        lines.push(colorize({ text: 'No matching worktrees found', color: 'yellow' }));
      } else {
        const { start, end } = computeVisibleWindow(filteredItems.length, selectionIndex);
        const visibleItems = filteredItems.slice(start, end);

        if (start > 0) {
          lines.push(colorize({ text: '⋮', color: 'dim' }));
        }

        for (let index = 0; index < visibleItems.length; index += 1) {
          const actualIndex = start + index;
          const isSelected = actualIndex === selectionIndex;
          const pointer = isSelected ? colorize({ text: '›', color: 'cyan' }) : ' ';
          const item = visibleItems[index]!;
          const display =
            item.kind === 'worktree'
              ? formatWorktreeDisplay({ worktree: item.worktree, currentBranch: args.options.currentBranch })
              : formatSuggestionDisplay({ suggestion: item.suggestion });

          const label = isSelected ? colorize({ text: display.label, color: 'bright' }) : display.label;
          lines.push(`${pointer} ${label}`);

          if (display.hint) {
            const hintText = isSelected ? colorize({ text: display.hint, color: 'bright' }) : display.hint;
            lines.push(`  ${hintText}`);
          }
        }

        if (end < filteredItems.length) {
          lines.push(colorize({ text: '⋮', color: 'dim' }));
        }
      }
      lines.push('');
      const totalLabel = `${filteredItems.length}/${args.items.length} result${filteredItems.length === 1 ? '' : 's'}`;
      lines.push(colorize({ text: totalLabel, color: 'dim' }));

      stdout.write(lines.map(line => `${line}\n`).join(''));
      lastRenderLineCount = lines.length;
      cursorTo(stdout, 0);
    };

    const cleanup = (result: WorktreeSelection | null) => {
      clearPreviousLines();
      clearLine(stdout, 0);
      cursorTo(stdout, 0);
      restoreCursor();

      if (typeof stdin.setRawMode === 'function') {
        stdin.setRawMode(originalRawMode);
      }

      stdin.removeListener('data', onData);
      stdin.pause();
      stdout.write('\n');
      resolve(result);
    };

    const moveSelection = (delta: number) => {
      if (filteredItems.length === 0) {
        return;
      }

      const length = filteredItems.length;
      const nextIndex = ((selectionIndex + delta) % length + length) % length;
      selectionIndex = nextIndex;
      render();
    };

    const onData = (chunk: string) => {
      if (chunk === '\u0003' || chunk === '\u001b') {
        cleanup(null);
        return;
      }

      if (chunk === '\r' || chunk === '\n') {
        if (selectionIndex >= 0 && filteredItems[selectionIndex]) {
          const selected = filteredItems[selectionIndex]!;
          const selection =
            selected.kind === 'worktree'
              ? ({ kind: 'worktree', worktree: selected.worktree } as const)
              : ({ kind: 'suggestion', suggestion: selected.suggestion } as const);
          cleanup(selection);
        }
        return;
      }

      if (chunk === '\x7f' || chunk === '\u0008' || chunk === '\u001b[3~') {
        if (searchQuery.length > 0) {
          searchQuery = searchQuery.slice(0, -1);
          updateFilteredItems();
          render();
        }
        return;
      }

      if (chunk === '\u001b[A' || chunk === '\u001bOA') {
        moveSelection(-1);
        return;
      }

      if (chunk === '\u001b[B' || chunk === '\u001bOB') {
        moveSelection(1);
        return;
      }

      if (chunk === '\u001b[5~') {
        moveSelection(-MAX_VISIBLE_ITEMS);
        return;
      }

      if (chunk === '\u001b[6~') {
        moveSelection(MAX_VISIBLE_ITEMS);
        return;
      }

      if (chunk.length === 1 && chunk >= ' ' && chunk <= '~') {
        searchQuery += chunk;
        updateFilteredItems();
        render();
        return;
      }

      if (!chunk.startsWith('\u001b')) {
        let changed = false;
        for (const char of chunk) {
          if (char >= ' ' && char <= '~') {
            searchQuery += char;
            changed = true;
          }
        }
        if (changed) {
          updateFilteredItems();
          render();
        }
      }
    };

    try {
      if (typeof stdin.setRawMode === 'function') {
        stdin.setRawMode(true);
      }
      stdin.setEncoding('utf8');
      stdin.resume();
      stdout.write('\x1b[?25l');

      updateFilteredItems();
      render();

      stdin.on('data', onData);
    } catch (error) {
      restoreCursor();
      if (typeof stdin.setRawMode === 'function') {
        stdin.setRawMode(originalRawMode);
      }
      stdin.removeListener('data', onData);
      stdin.pause();
      resolve(null);
    }
  });
}

function formatWorktreeDisplay(args: { worktree: Worktree; currentBranch?: string }) {
  const statusStr = args.worktree.status ? formatStatus({ status: args.worktree.status }) : '';
  const marker = args.currentBranch === args.worktree.branch ? colorize({ text: '→', color: 'cyan' }) : ' ';
  const branchColor = args.worktree.isMain ? 'cyan' : 'green';
  const labelParts = [`${marker} ${colorize({ text: args.worktree.branch, color: branchColor })}`];
  if (statusStr) {
    labelParts.push(statusStr);
  }
  const label = labelParts.join(' ').trim();
  const hint = colorize({
    text: formatPath({ path: args.worktree.path, maxLength: PICKER_PATH_MAX_LENGTH }),
    color: 'dim',
  });
  return { label, hint };
}

function formatSuggestionDisplay(args: { suggestion: WorktreeSuggestion }) {
  const marker = colorize({ text: '+', color: 'green' });
  const branchColor = args.suggestion.isDraft ? 'yellow' : 'magenta';
  const branchLabel = colorize({ text: args.suggestion.branch, color: branchColor });
  const draftLabel = args.suggestion.isDraft ? colorize({ text: ' (draft)', color: 'dim' }) : '';
  const prNumber = colorize({ text: `#${args.suggestion.number}`, color: 'cyan' });
  const copilotLabel = args.suggestion.copilotAssigned ? colorize({ text: ' [Copilot]', color: 'dim' }) : '';
  const label = `${marker} ${branchLabel}${draftLabel} ${prNumber}${copilotLabel}`.trim();

  const hintSegments: string[] = [];
  if (args.suggestion.title) {
    hintSegments.push(args.suggestion.title);
  } else if (args.suggestion.url) {
    hintSegments.push(args.suggestion.url);
  } else {
    hintSegments.push('Remote branch');
  }

  if (args.suggestion.copilotAssigned) {
    hintSegments.push('Assigned by GitHub Copilot');
  }

  const hint = colorize({ text: hintSegments.join(' • '), color: 'dim' });
  return { label, hint };
}

function computeVisibleWindow(total: number, selectedIndex: number) {
  if (total <= MAX_VISIBLE_ITEMS) {
    return { start: 0, end: total };
  }

  const halfWindow = Math.floor(MAX_VISIBLE_ITEMS / 2);
  let start = Math.max(0, selectedIndex - halfWindow);
  if (start + MAX_VISIBLE_ITEMS > total) {
    start = total - MAX_VISIBLE_ITEMS;
  }

  const end = Math.min(start + MAX_VISIBLE_ITEMS, total);
  return { start, end };
}
