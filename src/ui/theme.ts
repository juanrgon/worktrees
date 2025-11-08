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

export const DEFAULT_PATH_MAX_LENGTH = 60;
export const DEFAULT_BOX_WIDTH = 70;

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

export function loading(args: { message: string }) {
  const message = args.message;
  log({ message: `… ${message}`, color: 'magenta' });
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
