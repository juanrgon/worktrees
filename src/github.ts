import { spawnSync } from 'child_process';
import { z } from 'zod';
import type { RepoInfo } from './types.ts';

const PR_JSON_FIELDS = [
  'number',
  'title',
  'headRefName',
  'url',
  'isDraft',
  'updatedAt',
] as const;

const pullRequestSummarySchema = z.object({
  number: z.number(),
  title: z.string(),
  headRefName: z.string(),
  url: z.string().optional(),
  isDraft: z.boolean().optional(),
  updatedAt: z.string().optional(),
});

export type PullRequestSummary = z.infer<typeof pullRequestSummarySchema>;

export type WorktreeSuggestion = {
  branch: string;
  number: number;
  title: string;
  url?: string;
  isDraft?: boolean;
  updatedAt?: string;
};

const ghAvailabilityState = {
  checked: false,
  available: false,
};

export function isGhInstalled(args: { cwd: string }) {
  if (!ghAvailabilityState.checked) {
    try {
      const result = spawnSync('gh', ['--version'], {
        cwd: args.cwd,
        stdio: 'ignore',
      });

      ghAvailabilityState.available = result.status === 0 && !result.error;
    } catch (error) {
      ghAvailabilityState.available = false;
    } finally {
      ghAvailabilityState.checked = true;
    }
  }

  return ghAvailabilityState.available;
}

export function getUserPullRequests(args: { repo: RepoInfo; limit: number }) {
  const repo = args.repo;
  const limit = args.limit;

  const jsonFields = PR_JSON_FIELDS.join(',');
  const commandArgs = [
    'pr',
    'list',
    '--repo',
    repo.fullName,
    '--state',
    'open',
    '--author',
    '@me',
    '--limit',
    `${limit}`,
    '--json',
    jsonFields,
  ] as const;

  try {
    const result = spawnSync('gh', commandArgs, {
      cwd: repo.root,
      encoding: 'utf8',
    });

    if (result.error || result.status !== 0) {
      return null;
    }

    const stdout = result.stdout.trim();
    if (!stdout) {
      return [];
    }

    const parsed: unknown = JSON.parse(stdout);
    if (!Array.isArray(parsed)) {
      return null;
    }

    const parsedPrs: PullRequestSummary[] = [];

    for (const entry of parsed) {
      const result = pullRequestSummarySchema.safeParse(entry);
      if (result.success) {
        parsedPrs.push(result.data);
      }
    }

    return parsedPrs;
  } catch (error) {
    return null;
  }
}

export function getWorktreeSuggestions(args: {
  repo: RepoInfo;
  existingBranches: Set<string>;
  limit: number;
}) {
  const suggestions: WorktreeSuggestion[] = [];
  const pullRequests = getUserPullRequests({ repo: args.repo, limit: args.limit });

  if (pullRequests === null) {
    return null;
  }

  for (const pr of pullRequests) {
    if (args.existingBranches.has(pr.headRefName)) {
      continue;
    }

    suggestions.push({
      branch: pr.headRefName,
      number: pr.number,
      title: pr.title,
      url: pr.url,
      isDraft: pr.isDraft,
      updatedAt: pr.updatedAt,
    });
  }

  return suggestions;
}
