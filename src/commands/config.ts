import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';
import { resolveConfig, CONFIG_KEYS } from '../config.ts';
import { error, success, info, colorize } from '../ui/theme.ts';

type ConfigKey = (typeof CONFIG_KEYS)[number];

const isConfigKey = (value: string | undefined): value is ConfigKey =>
  typeof value === 'string' && CONFIG_KEYS.some(validKey => validKey === value);


export function configCommand(args: { values: string[] }) {
  // All parameters required; values must be provided
  const hasGlobalFlag = args.values.includes('--global');
  const values = args.values.filter(token => token !== '--global');
  const [action, key, value] = values;

  if (!action) {
    error({ message: 'Usage: wt config <get|set|list> [key] [value] [--global]' });
    process.exit(1);
  }

  switch (action) {
    case 'get':
      if (!key) {
        error({ message: 'Usage: wt config get <key>' });
        process.exit(1);
      }
      getConfig({ key });
      break;
    case 'set':
      if (!key || value === undefined) {
        error({ message: 'Usage: wt config set <key> <value> [--global]' });
        process.exit(1);
      }
      setConfig({ key, value, global: hasGlobalFlag });
      break;
    case 'list':
      listConfig();
      break;
    default:
      error({ message: `Unknown action: ${action}` });
      error({ message: 'Usage: wt config <get|set|list> [key] [value] [--global]' });
      process.exit(1);
  }
}


function getConfig(args: { key: string }) {
  // key is now required
  if (!args.key) {
    error({ message: 'Usage: wt config get <key>' });
    process.exit(1);
  }

  const resolved = resolveConfig({ cwd: process.cwd() });

  if (!isConfigKey(args.key)) {
    error({ message: `Config key not found: ${args.key}` });
    process.exit(1);
  }

  const value = resolved[args.key];

  if (value === undefined) {
    error({ message: `Config key not found: ${args.key}` });
    process.exit(1);
  }

  console.log(value);
}


function setConfig(args: { key: string; value: string; global: boolean }) {
  // All parameters required
  if (!args.key || args.value === undefined) {
    error({ message: 'Usage: wt config set <key> <value> [--global]' });
    process.exit(1);
  }

  if (!isConfigKey(args.key)) {
    error({ message: `Invalid config key: ${args.key}` });
    error({ message: `Valid keys: ${CONFIG_KEYS.join(', ')}` });
    process.exit(1);
  }

  const configPath = args.global ? join(homedir(), '.wt.toml') : join(process.cwd(), '.wt.toml');

  let parsedValue: string | boolean = args.value;
  if (args.key === 'autoOpen') {
    parsedValue = args.value.toLowerCase() === 'true';
  }

  const tomlContent = buildTomlContent({ configPath, key: args.key, value: parsedValue });

  const dir = dirname(configPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  writeFileSync(configPath, tomlContent, 'utf-8');
  success({ message: `Set ${args.key} = ${parsedValue}` });
  info({ message: `Config file: ${configPath}` });
}

function buildTomlContent(args: { configPath: string; key: string; value: string | boolean }) {
  let existingContent = '';
  if (existsSync(args.configPath)) {
    const fs = require('fs');
    existingContent = fs.readFileSync(args.configPath, 'utf-8');
  }

  const lines = existingContent.split('\n').filter(line => !line.trim().startsWith(`${args.key} =`));
  const valueStr = typeof args.value === 'boolean' ? args.value.toString() : `"${args.value}"`;
  lines.push(`${args.key} = ${valueStr}`);

  return lines.filter(line => line.trim()).join('\n') + '\n';
}

function listConfig() {
  const resolved = resolveConfig({ cwd: process.cwd() });

  console.log();
  console.log(colorize({ text: 'Configuration:', color: 'bright' }));
  console.log();

  for (const key of CONFIG_KEYS) {
    const value = resolved[key];
    const source = resolved.sources[key];

    if (value !== undefined) {
      console.log(`  ${colorize({ text: key, color: 'cyan' })} = ${colorize({ text: String(value), color: 'green' })}`);
      if (source) {
        const sourceType = source.type === 'default'
          ? colorize({ text: '(default)', color: 'dim' })
          : colorize({ text: source.path, color: 'dim' });
        console.log(`    from: ${sourceType}`);
      }
      console.log();
    }
  }
}
