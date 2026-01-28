# wt - Git worktree manager shell wrapper
# Add this to your .bashrc or .zshrc:
#   source /path/to/wt-cli/wt.sh

wt() {
  if [[ "$1" == "cd" ]]; then
    if [[ -z "$2" ]]; then
      echo "Usage: wt cd <branch>" >&2
      return 1
    fi
    local path
    path=$(command wt cd "$2" 2>&1)
    local exit_code=$?
    if [[ $exit_code -eq 0 ]]; then
      cd "$path"
    else
      echo "$path" >&2
      return $exit_code
    fi
  else
    command wt "$@"
  fi
}
