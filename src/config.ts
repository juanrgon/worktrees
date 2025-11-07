import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';
import { parse as parseToml } from '@iarna/toml';
import type { Config, ResolvedConfig, ConfigSource } from './types.ts';

export const CONFIG_KEYS = ['editor', 'worktreesRoot', 'autoOpen', 'repoName'] as const;
type ConfigKey = (typeof CONFIG_KEYS)[number];

const DEFAULT_CONFIG = {
  editor: process.env.EDITOR || process.env.VISUAL || 'code',
  worktreesRoot: join(homedir(), 'worktrees'),
  autoOpen: false,
} satisfies Config;


export function loadConfig(args: { cwd: string }) {
  // All parameters required; provide cwd explicitly
  const resolved = resolveConfig({ cwd: args.cwd });
  return {
    editor: resolved.editor,
    worktreesRoot: resolved.worktreesRoot,
    autoOpen: resolved.autoOpen,
    repoName: resolved.repoName,
  };
}

export function resolveConfig(args: { cwd: string }) {
  // All parameters required; provide cwd explicitly
  const workingDir = args.cwd;
  const configs: Array<{ config: Config; source: ConfigSource }> = [];

  // 1. Defaults
  configs.push({
    config: DEFAULT_CONFIG,
    source: { path: '(default)', type: 'default' },
  });

  // 2. Global config (~/.wt.toml or ~/.config/wt/config.toml)
  const homeConfig = join(homedir(), '.wt.toml');
  const xdgConfig = join(homedir(), '.config', 'wt', 'config.toml');

  if (existsSync(homeConfig)) {
    const config = loadTomlFile({ path: homeConfig });
    configs.push({
      config,
      source: { path: homeConfig, type: 'global' },
    });
  } else if (existsSync(xdgConfig)) {
    const config = loadTomlFile({ path: xdgConfig });
    configs.push({
      config,
      source: { path: xdgConfig, type: 'global' },
    });
  }

  // 3. Walk up directory tree for .wt.toml files
  let currentDir = workingDir;
  const localConfigs: Array<{ config: Config; source: ConfigSource }> = [];

  while (currentDir !== dirname(currentDir)) {
    const configPath = join(currentDir, '.wt.toml');
    if (existsSync(configPath)) {
      const config = loadTomlFile({ path: configPath });
      localConfigs.unshift({
        config,
        source: { path: configPath, type: 'local' },
      });
    }
    currentDir = dirname(currentDir);
  }

  configs.push(...localConfigs);

  // Merge configs and track sources
  const merged: Config = {};
  const sources: Partial<Record<ConfigKey, ConfigSource>> = {};

  for (const entry of configs) {
    const config = entry.config;
    const source = entry.source;

    if (config.editor !== undefined) {
      merged.editor = config.editor;
      sources.editor = source;
    }
    if (config.worktreesRoot !== undefined) {
      merged.worktreesRoot = config.worktreesRoot;
      sources.worktreesRoot = source;
    }
    if (config.autoOpen !== undefined) {
      merged.autoOpen = config.autoOpen;
      sources.autoOpen = source;
    }
    if (config.repoName !== undefined) {
      merged.repoName = config.repoName;
      sources.repoName = source;
    }
  }

  const resolvedConfig = {
    ...merged,
    sources,
  } satisfies ResolvedConfig;

  return resolvedConfig;
}

function loadTomlFile(args: { path: string }) {
  const filePath = args.path;
  try {
    const content = readFileSync(filePath, 'utf-8');
    const parsed = parseToml(content);

    return {
      editor: typeof parsed.editor === 'string' ? parsed.editor : undefined,
      worktreesRoot:
        typeof parsed.worktreesRoot === 'string' ? parsed.worktreesRoot : undefined,
      autoOpen: typeof parsed.autoOpen === 'boolean' ? parsed.autoOpen : undefined,
      repoName: typeof parsed.repoName === 'string' ? parsed.repoName : undefined,
    };
  } catch (error) {
    return {};
  }
}


export function expandPath(args: { path: string }) {
  // All parameters required
  const targetPath = args.path;
  if (targetPath.startsWith('~/')) {
    return join(homedir(), targetPath.slice(2));
  }
  return targetPath;
}
