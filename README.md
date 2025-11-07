# wt - Git Worktree Manager

A modern CLI tool for managing git worktrees with an interactive UI.

## Features

- 🚀 **Interactive picker** with fuzzy search
- 📁 **Smart worktree organization**: `~/worktrees/{branch}/{org}/{repo}/`
- ⚙️ **Hierarchical configuration** with `.wt.toml` files
- 🎨 **Beautiful UI** with status indicators (● changes, ↑ ahead, ↓ behind)
- 🔧 **Editor integration** (VS Code, Vim, etc.)
- 🧹 **Auto-cleanup** of merged/deleted branches

## Installation

```bash
npm install -g wt-cli
```

### Local Development

```bash
git clone <repo>
cd wt-cli
npm install
npm link
```

## Quick Start

```bash
# Create a new worktree
wt new feature-x

# Open interactive picker
wt

# List all worktrees
wt list

# Clean up merged branches
wt cleanup
```

## Commands

- `wt` - Interactive worktree picker
- `wt new <branch> [--open]` - Create new worktree
- `wt open` - Interactive picker to open worktree
- `wt list` - List all worktrees with status
- `wt remove <branch>` - Remove a worktree
- `wt cleanup` - Remove merged/deleted branch worktrees
- `wt status` - Show overview of all worktrees
- `wt config <action>` - Manage configuration

## Configuration

Config files are resolved hierarchically:
1. Defaults
2. `~/.wt.toml` (or `~/.config/wt/config.toml`)
3. `.wt.toml` files walking up from current directory
4. CLI flags

### Config Options

```toml
# ~/.wt.toml
editor = "code"
worktreesRoot = "~/worktrees"
autoOpen = true
repoName = "github/copilot-api"  # override repo detection
```

### Config Commands

```bash
wt config set editor nvim --global
wt config set autoOpen true
wt config get editor
wt config list
```

## Worktree Structure

Worktrees are organized as: `~/worktrees/{branch}/{org}/{repo}/`

Example:
```
~/worktrees/
  feature-x/
    github/
      copilot-api/
      copilot-cli/
  fix-bug-y/
    github/
      copilot-api/
```

This structure:
- ✅ Keeps repo directory name consistent (scripts work!)
- ✅ No clashes between repos or branches
- ✅ Groups cross-repo features naturally

## Editor Integration

The `--open` flag (or `autoOpen` config) will open worktrees in your editor:

```bash
wt new feature-x --open
```

Editor resolution order:
1. Config `editor` field
2. `$EDITOR` environment variable
3. `$VISUAL` environment variable
4. Default: `code`

## Requirements

- Node.js >= 20.0.0 (for `--experimental-strip-types`)
- Git >= 2.5 (for worktrees)

## License

MIT
