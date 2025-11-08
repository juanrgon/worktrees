import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import type { WorktreeStatus } from '../types.ts';

export const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
} as const;

type ColorKey = keyof typeof colors;

type LoadingHandle = {
  stop: () => void;
};

export const DEFAULT_PATH_MAX_LENGTH = 60;
export const DEFAULT_BOX_WIDTH = 70;
const LOADING_BASE_COLOR = 203;
const LOADING_HIGHLIGHT_COLOR = 210;
const LOADING_INTERVAL_MS = 200;
const LOADING_START_DELAY_MS = 400;
const LOADING_CYCLE_DELAY_MS = 200;
const LOADING_FALLBACK_PREFIX = '… ';

export function colorize(args: { text: string; color: ColorKey }) {
  const text = args.text;
  const color = args.color;
  return `${colors[color]}${text}${colors.reset}`;
}

export function log(args: { message: string; color: ColorKey }) {
  const message = args.message;
  const color = args.color;
  console.log(`${colors[color]}${message}${colors.reset}`);
}

export function error(args: { message: string }) {
  const message = args.message;
  log({ message: `✗ ${message}`, color: 'red' });
}

export function success(args: { message: string }) {
  const message = args.message;
  log({ message: `✓ ${message}`, color: 'green' });
}

export function info(args: { message: string }) {
  const message = args.message;
  log({ message: `ℹ ${message}`, color: 'blue' });
}

const supportsAnsi256 = () => {
  const stdout = process.stdout as NodeJS.WriteStream & { getColorDepth?: () => number };
  if (!stdout.isTTY) {
    return false;
  }
  if (typeof stdout.getColorDepth !== 'function') {
    return false;
  }
  return stdout.getColorDepth() >= 8;
};

const clearLine = () => {
  process.stdout.write('\r\x1b[K');
};

const sleep = (args: { durationMs: number }) =>
  new Promise<void>(resolve => {
    const durationMs = Math.max(Math.floor(args.durationMs), 0);
    if (durationMs === 0) {
      resolve();
      return;
    }

    setTimeout(resolve, durationMs);
  });

const startLoadingAnimation = (args: { text: string }) => {
  const text = args.text;
  const ansiAvailable = supportsAnsi256();
  if (!ansiAvailable || text.length === 0) {
    log({ message: text.length === 0 ? `${LOADING_FALLBACK_PREFIX}Loading...` : text, color: 'magenta' });
    return { stop: () => {} } satisfies LoadingHandle;
  }

  const workerUrl = new URL('./loading-worker.js', import.meta.url);
  const workerPath = fileURLToPath(workerUrl);
  const child = spawn(process.execPath, [
    workerPath,
    '--text',
    text,
    '--base-color',
    String(LOADING_BASE_COLOR),
    '--highlight-color',
    String(LOADING_HIGHLIGHT_COLOR),
    '--interval',
    String(LOADING_INTERVAL_MS),
    '--start-delay',
    String(LOADING_START_DELAY_MS),
    '--cycle-delay',
    String(LOADING_CYCLE_DELAY_MS),
  ], {
    stdio: ['ignore', 'inherit', 'inherit'],
    env: {
      ...process.env,
      WT_LOADING_TTY: ansiAvailable ? '1' : '0',
    },
  });

  let stopped = false;
  let cleaned = false;
  const handleExit = () => cleanup();

  const cleanup = () => {
    if (cleaned) {
      return;
    }
    cleaned = true;
    clearLine();
    child.removeListener('exit', handleExit);
    child.removeListener('error', handleError);
    if (child.exitCode === null && child.signalCode === null && !child.killed) {
      try {
        child.kill('SIGTERM');
      } catch {
        // ignore
      }
    }
  };

  const handleError = () => {
    cleanup();
    log({ message: text, color: 'magenta' });
  };

  child.once('error', handleError);
  child.once('exit', handleExit);

  const stop = () => {
    if (stopped) {
      return;
    }
    stopped = true;
    cleanup();
  };

  return { stop } satisfies LoadingHandle;
};

export function loading(args: { message: string }) {
  const text = args.message.trim().length > 0 ? args.message : 'Loading...';
  const display = text.startsWith(LOADING_FALLBACK_PREFIX) ? text : `${LOADING_FALLBACK_PREFIX}${text}`;
  return startLoadingAnimation({ text: display });
}

export async function runWithLoading<T>(args: { message: string; task: () => Promise<T> | T }) {
  const debugMinimumDuration = Number(process.env.WT_LOADING_DEBUG_MIN_MS ?? '0');
  const minimumDurationMs = Number.isFinite(debugMinimumDuration) ? Math.max(debugMinimumDuration, 0) : 0;
  const startTime = Date.now();
  const loader = loading({ message: args.message });

  try {
    const result = await Promise.resolve(args.task());
    if (minimumDurationMs > 0) {
      const elapsed = Date.now() - startTime;
      if (elapsed < minimumDurationMs) {
        await sleep({ durationMs: minimumDurationMs - elapsed });
      }
    }
    return result;
  } catch (error) {
    throw error;
  } finally {
    loader.stop();
  }
}

export function warning(args: { message: string }) {
  const message = args.message;
  log({ message: `⚠ ${message}`, color: 'yellow' });
}

export function formatStatus(args: { status: WorktreeStatus }) {
  const status = args.status;
  const parts: string[] = [];

  if (status.hasChanges) {
    parts.push(colorize({ text: '●', color: 'yellow' }));
  }

  if (status.ahead > 0) {
    parts.push(colorize({ text: `↑${status.ahead}`, color: 'green' }));
  }

  if (status.behind > 0) {
    parts.push(colorize({ text: `↓${status.behind}`, color: 'red' }));
  }

  return parts.join(' ');
}

export function formatPath(args: { path: string; maxLength: number }) {
  const path = args.path;
  const maxLength = args.maxLength;

  if (path.length <= maxLength) {
    return path;
  }

  const home = process.env.HOME || '';
  if (path.startsWith(home)) {
    const relativePath = `~${path.slice(home.length)}`;
    if (relativePath.length <= maxLength) {
      return relativePath;
    }
    return `...${relativePath.slice(-(maxLength - 3))}`;
  }

  return `...${path.slice(-(maxLength - 3))}`;
}

export function box(args: { title: string; content: string[]; width: number }) {
  const title = args.title;
  const content = args.content;
  const width = args.width;
  const lines = [
    `┌─ ${title} ${'─'.repeat(Math.max(0, width - title.length - 4))}┐`,
    `│${' '.repeat(width - 2)}│`,
  ];

  for (const line of content) {
    const stripped = line.replace(/\x1b\[[0-9;]*m/g, '');
    const padding = Math.max(0, width - stripped.length - 4);
    lines.push(`│  ${line}${' '.repeat(padding)}│`);
  }

  lines.push(`│${' '.repeat(width - 2)}│`);
  lines.push(`└${'─'.repeat(width - 2)}┘`);

  return lines.join('\n');
}
