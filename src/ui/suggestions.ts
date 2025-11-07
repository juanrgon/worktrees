import { colorize } from './theme.ts';
import { isGhInstalled, getWorktreeSuggestions } from '../github.ts';
import type { RepoInfo } from '../types.ts';
import type { WorktreeSuggestion } from '../github.ts';

export function printWorktreeSuggestions(args: { suggestions: WorktreeSuggestion[] }) {
  const suggestions = args.suggestions;
  if (suggestions.length === 0) {
    return;
  }

  console.log(colorize({ text: 'Remote pull requests ready for worktrees:', color: 'bright' }));
  console.log();

  for (const suggestion of suggestions) {
    const branchColor = suggestion.isDraft ? 'yellow' : 'magenta';
    const branchLabel = colorize({ text: suggestion.branch, color: branchColor });
    const draftLabel = suggestion.isDraft ? colorize({ text: ' (draft)', color: 'dim' }) : '';
    const prNumber = colorize({ text: `#${suggestion.number}`, color: 'cyan' });
    const titleSuffix = suggestion.title ? ` - ${suggestion.title}` : '';

    console.log(`  ${colorize({ text: '*', color: 'dim' })} ${branchLabel}${draftLabel} ${prNumber}${titleSuffix}`);

    if (suggestion.url) {
      console.log(`    ${colorize({ text: suggestion.url, color: 'dim' })}`);
    }
  }

  console.log();
  console.log(
    colorize({
      text: 'Tip: Select a suggestion in wt open to create a worktree automatically.',
      color: 'dim',
    }),
  );
  console.log();
}

export type SuggestionResolution =
  | { status: 'unavailable' }
  | { status: 'error' }
  | { status: 'empty' }
  | { status: 'ok'; suggestions: WorktreeSuggestion[] };

export function resolveWorktreeSuggestions(args: {
  repo: RepoInfo;
  existingBranches: Set<string>;
  limit: number;
}): SuggestionResolution {
  const ghAvailable = isGhInstalled({ cwd: args.repo.root });

  if (!ghAvailable) {
    return { status: 'unavailable' };
  }

  const suggestions = getWorktreeSuggestions({
    repo: args.repo,
    existingBranches: args.existingBranches,
    limit: args.limit,
  });

  if (suggestions === null) {
    return { status: 'error' };
  }

  if (suggestions.length === 0) {
    return { status: 'empty' };
  }

  return { status: 'ok', suggestions };
}
