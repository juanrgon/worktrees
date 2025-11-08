import { spawnSync } from 'child_process';
import { z } from 'zod';
import type { RepoInfo } from './types.ts';

const PR_JSON_FIELDS = ['number', 'title', 'headRefName', 'url', 'isDraft', 'updatedAt', 'author'] as const;

const pullRequestAuthorSchema = z.object({
  login: z.string(),
});

const pullRequestSummarySchema = z.object({
  number: z.number(),
  title: z.string(),
  headRefName: z.string(),
  url: z.string().optional(),
  isDraft: z.boolean().optional(),
  updatedAt: z.string().optional(),
  author: pullRequestAuthorSchema.optional(),
});

export type PullRequestSummary = z.infer<typeof pullRequestSummarySchema>;

export type WorktreeSuggestion = {
  branch: string;
  number: number;
  title: string;
  url?: string;
  isDraft?: boolean;
  updatedAt?: string;
  copilotAssigned: boolean;
};

const COPILOT_AUTHOR_MARKERS = ['github-copilot', 'app/copilot', 'copilot-swe-agent', 'copilot/'] as const;
const COPILOT_SUGGESTION_FETCH_MIN_LIMIT = 30 as const;

const isCopilotAuthorLogin = (login: string) => {
  const normalized = login.toLowerCase();
  for (const marker of COPILOT_AUTHOR_MARKERS) {
    if (normalized.includes(marker)) {
      return true;
    }
  }
  return false;
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

function runGhPullRequestList(args: { repo: RepoInfo; limit: number; extraArgs: string[] }) {
  const repo = args.repo;
  const limit = args.limit;
  const extraArgs = args.extraArgs;
  const jsonFields = PR_JSON_FIELDS.join(',');
  const commandArgs = [
    'pr',
    'list',
    '--repo',
    repo.fullName,
    '--state',
    'open',
    '--limit',
    `${limit}`,
    '--json',
    jsonFields,
    ...extraArgs,
  ];

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
      const validation = pullRequestSummarySchema.safeParse(entry);
      if (validation.success) {
        parsedPrs.push(validation.data);
      }
    }

    return parsedPrs;
  } catch (error) {
    return null;
  }
}

export function getUserPullRequests(args: { repo: RepoInfo; limit: number }) {
  return runGhPullRequestList({
    repo: args.repo,
    limit: args.limit,
    extraArgs: ['--author', '@me'],
  });
}

export function getAssignedCopilotPullRequests(args: { repo: RepoInfo; limit: number }) {
  const pullRequests = runGhPullRequestList({
    repo: args.repo,
    limit: Math.max(args.limit, COPILOT_SUGGESTION_FETCH_MIN_LIMIT),
    extraArgs: ['--assignee', '@me'],
  });

  if (pullRequests === null) {
    return null;
  }

  const filtered: PullRequestSummary[] = [];

  for (const pr of pullRequests) {
    const authorLogin = pr.author?.login;
    if (!authorLogin) {
      continue;
    }

    if (!isCopilotAuthorLogin(authorLogin)) {
      continue;
    }

    filtered.push(pr);
  }

  if (filtered.length === 0) {
    return [];
  }

  return filtered.slice(0, Math.max(args.limit, 0));
}

export function getWorktreeSuggestions(args: {
  repo: RepoInfo;
  existingBranches: Set<string>;
  limit: number;
}) {
  const existingBranches = args.existingBranches;
  const limit = args.limit;
  const seenBranches = new Set<string>(existingBranches);
  const suggestions: WorktreeSuggestion[] = [];
  const authoredPullRequests = getUserPullRequests({ repo: args.repo, limit });
  const assignedPullRequests = getAssignedCopilotPullRequests({ repo: args.repo, limit });

  if (authoredPullRequests === null && assignedPullRequests === null) {
    return null;
  }

  const addSuggestion = (additionArgs: { pr: PullRequestSummary; copilotAssigned: boolean }) => {
    const pr = additionArgs.pr;
    const branch = pr.headRefName;

    if (seenBranches.has(branch)) {
      return;
    }

    seenBranches.add(branch);
    suggestions.push({
      branch,
      number: pr.number,
      title: pr.title,
      url: pr.url,
      isDraft: pr.isDraft,
      updatedAt: pr.updatedAt,
      copilotAssigned: additionArgs.copilotAssigned,
    });
  };

  if (authoredPullRequests !== null) {
    for (const pr of authoredPullRequests) {
      addSuggestion({ pr, copilotAssigned: false });
    }
  }

  if (assignedPullRequests !== null) {
    for (const pr of assignedPullRequests) {
      addSuggestion({ pr, copilotAssigned: true });
    }
  }

  if (suggestions.length === 0) {
    return [];
  }

  const sortByRecency = (list: WorktreeSuggestion[]) => {
    const toTimestamp = (value?: string) => {
      if (!value) {
        return 0;
      }

      const parsed = Date.parse(value);
      return Number.isNaN(parsed) ? 0 : parsed;
    };

    list.sort((left, right) => {
      const rightTimestamp = toTimestamp(right.updatedAt);
      const leftTimestamp = toTimestamp(left.updatedAt);

      if (rightTimestamp !== leftTimestamp) {
        return rightTimestamp - leftTimestamp;
      }

      return left.branch.localeCompare(right.branch);
    });
  };

  const authoredSuggestions = suggestions.filter(suggestion => !suggestion.copilotAssigned);
  const copilotSuggestions = suggestions.filter(suggestion => suggestion.copilotAssigned);

  sortByRecency(authoredSuggestions);
  sortByRecency(copilotSuggestions);

  if (authoredSuggestions.length >= limit) {
    return authoredSuggestions.slice(0, limit);
  }

  const remaining = Math.max(limit - authoredSuggestions.length, 0);
  const combined = [...authoredSuggestions, ...copilotSuggestions.slice(0, remaining)];

  return combined;
}
