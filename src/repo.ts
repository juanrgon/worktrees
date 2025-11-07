import { getGitRoot, getRemoteUrl, isGitRepo } from "./git.ts";
import { loadConfig } from "./config.ts";

export function detectRepoInfo(args: { cwd: string }) {
  // All parameters required
  const workingDir = args.cwd;

  if (!isGitRepo({ cwd: workingDir })) {
    return null;
  }

  const root = getGitRoot({ cwd: workingDir });

  // Check for config override first
  const config = loadConfig({ cwd: workingDir });
  if (config.repoName) {
    const parts = config.repoName.split("/");
    if (parts.length === 2) {
      return {
        root,
        org: parts[0]!,
        name: parts[1]!,
        fullName: config.repoName,
      };
    }
  }

  // Try to parse from remote URL
  const remoteUrl = getRemoteUrl({ cwd: workingDir });
  if (remoteUrl) {
    const parsed = parseRepoFromRemote({ remoteUrl });
    if (parsed) {
      return { root, ...parsed };
    }
  }

  // Fallback: parse from directory structure
  const parsed = parseRepoFromPath({ path: root });
  if (parsed) {
    return { root, ...parsed };
  }

  // Ultimate fallback: just use directory name
  const name = root.split("/").pop() || "unknown";
  return {
    root,
    org: "local",
    name,
    fullName: `local/${name}`,
  };
}

function parseRepoFromRemote(args: { remoteUrl: string }) {
  const remoteUrl = args.remoteUrl;
  // Handle various git URL formats:
  // - git@github.com:github/copilot-api.git
  // - https://github.com/github/copilot-api.git
  // - https://github.com/github/copilot-api

  const patterns = [
    /github\.com[:/]([^/]+)\/([^/.]+)/, // GitHub
    /gitlab\.com[:/]([^/]+)\/([^/.]+)/, // GitLab
    /bitbucket\.org[:/]([^/]+)\/([^/.]+)/, // Bitbucket
    /[:/]([^/]+)\/([^/.]+)\.git$/, // Generic git URL
  ] as const;

  for (const pattern of patterns) {
    const match = remoteUrl.match(pattern);
    if (match) {
      const org = match[1]!;
      const name = match[2]!.replace(/\.git$/, "");
      return { org, name, fullName: `${org}/${name}` };
    }
  }

  return null;
}

function parseRepoFromPath(args: { path: string }) {
  const path = args.path;
  // Try to detect patterns like:
  // - ~/github.com/github/copilot-api
  // - ~/github/copilot-api
  // - ~/code/github/copilot-api

  const parts = path.split("/");

  // Look for github.com/org/repo pattern
  const githubComIndex = parts.indexOf("github.com");
  if (githubComIndex >= 0 && parts.length >= githubComIndex + 3) {
    const org = parts[githubComIndex + 1]!;
    const name = parts[githubComIndex + 2]!;
    return { org, name, fullName: `${org}/${name}` };
  }

  // Look for org/repo pattern at the end
  if (parts.length >= 2) {
    const name = parts[parts.length - 1]!;
    const org = parts[parts.length - 2]!;

    // Only use this if org looks reasonable (not generic directories)
    const genericDirs = [
      "code",
      "projects",
      "workspace",
      "dev",
      "src",
      "repos",
    ] as const;
    if (!genericDirs.includes(org)) {
      return { org, name, fullName: `${org}/${name}` };
    }
  }

  return null;
}
