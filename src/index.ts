import { newCommand } from './commands/new.ts';
import { cloneCommand } from './commands/clone.ts';
import { openCommand } from './commands/open.ts';
import { listCommand } from './commands/list.ts';
import { removeCommand } from './commands/remove.ts';
import { cleanupCommand } from './commands/cleanup.ts';
import { statusCommand } from './commands/status.ts';
import { configCommand } from './commands/config.ts';
import { migrateCommand } from './commands/migrate.ts';
import { error, colorize } from './ui/theme.ts';

export async function main(args: { argv: string[] }) {
  const argv = args.argv;
  const command = argv[0];
  const commandArgs = argv.slice(1);

  // Check for --open flag
  const openFlagIndex = commandArgs.indexOf('--open');
  const hasOpenFlag = openFlagIndex !== -1;
  const cleanArgs = hasOpenFlag
    ? [...commandArgs.slice(0, openFlagIndex), ...commandArgs.slice(openFlagIndex + 1)]
    : commandArgs;

  try {
    switch (command) {
      case 'new': {
        const branchArg = cleanArgs[0];
        if (!branchArg) {
          error({ message: 'Usage: wt new <branch> [--open]' });
          process.exit(1);
        }
        await newCommand({ branch: branchArg, open: hasOpenFlag });
        break;
      }

      case 'clone': {
        const branchArg = cleanArgs[0];
        if (!branchArg) {
          error({ message: 'Usage: wt clone <branch> [--open]' });
          process.exit(1);
        }
        await cloneCommand({ branch: branchArg, open: hasOpenFlag });
        break;
      }

      case 'open':
        await openCommand({ open: true, branch: cleanArgs[0] });
        break;

      case 'list':
      case 'ls':
        await listCommand();
        break;

      case 'remove':
      case 'rm':
        if (!cleanArgs[0]) {
          error({ message: 'Usage: wt remove <branch>' });
          process.exit(1);
        }
        await removeCommand({ branch: cleanArgs[0] });
        break;

      case 'cleanup':
      case 'clean':
        await cleanupCommand();
        break;

      case 'status':
      case 'st':
        await statusCommand();
        break;

      case 'config':
        configCommand({ values: cleanArgs });
        break;

      case 'migrate':
        await migrateCommand();
        break;

      case 'help':
      case '--help':
      case '-h':
        showHelp();
        break;

      case 'version':
      case '--version':
      case '-v':
        showVersion();
        break;

      case undefined:
        // No command = interactive open
        await openCommand({ open: hasOpenFlag });
        break;

      default:
        error({ message: `Unknown command: ${command}` });
        console.log();
        showHelp();
        process.exit(1);
    }
  } catch (unknownError) {
    const message = unknownError instanceof Error ? unknownError.message : 'An error occurred';
    error({ message });
    process.exit(1);
  }
}

function showHelp() {
  console.log();
  console.log(colorize({ text: 'wt - Git worktree manager', color: 'bright' }));
  console.log();
  console.log(colorize({ text: 'Usage:', color: 'cyan' }));
  console.log('  wt                       Open interactive worktree picker');
  console.log('  wt new <branch>          Create a new worktree');
  console.log('  wt clone <branch>        Clone a remote branch into a worktree');
  console.log('  wt open                  Open interactive worktree picker');
  console.log('  wt list                  List all worktrees');
  console.log('  wt remove <branch>       Remove a worktree');
  console.log('  wt cleanup               Remove worktrees for merged/deleted branches');
  console.log('  wt migrate               Migrate worktrees to new directory structure');
  console.log('  wt status                Show status of all worktrees');
  console.log('  wt config <action>       Manage configuration');
  console.log('  wt help                  Show this help');
  console.log('  wt version               Show version');
  console.log();
  console.log(colorize({ text: 'Flags:', color: 'cyan' }));
  console.log('  --open                   Open worktree in editor after creating');
  console.log();
  console.log(colorize({ text: 'Config:', color: 'cyan' }));
  console.log('  wt config get <key>              Get config value');
  console.log('  wt config set <key> <value>      Set config value (local)');
  console.log('  wt config set <key> <value> --global  Set config value (global)');
  console.log('  wt config list                   List all config');
  console.log();
  console.log(colorize({ text: 'Config keys:', color: 'dim' }));
  console.log('  editor          Editor command (default: $EDITOR or "code")');
  console.log('  worktreesRoot   Root directory for worktrees (default: ~/worktrees)');
  console.log('  autoOpen        Auto-open worktrees in editor (default: false)');
  console.log('  repoName        Override repo name (e.g., "github/copilot-api")');
  console.log('  directoryStructure  Directory structure (branch-first | repo-first)');
  console.log();
  console.log(colorize({ text: 'Examples:', color: 'cyan' }));
  console.log('  wt new feature-x --open');
  console.log('  wt open');
  console.log('  wt list');
  console.log('  wt cleanup');
  console.log('  wt config set editor nvim --global');
  console.log();
}

function showVersion() {
  // Read version from package.json
  console.log('wt v0.1.0');
}
