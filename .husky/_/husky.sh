#!/usr/bin/env sh
if [ "$HUSKY" = "2" ]; then
  set -x
fi

hook_name=$(basename "$0")
hook_path="$(dirname "$(dirname "$0")")/$hook_name"

if [ ! -f "$hook_path" ]; then
  exit 0
fi

if [ -f "$HOME/.huskyrc" ]; then
  echo "husky - '~/.huskyrc' is DEPRECATED, please move your code to ~/.config/husky/init.sh"
fi

init_file="${XDG_CONFIG_HOME:-$HOME/.config}/husky/init.sh"
if [ -f "$init_file" ]; then
  . "$init_file"
fi

if [ "${HUSKY-}" = "0" ]; then
  exit 0
fi

export PATH="node_modules/.bin:$PATH"
sh -e "$hook_path" "$@"
exit_code=$?

if [ "$exit_code" -ne 0 ]; then
  echo "husky - $hook_name script failed (code $exit_code)"
fi

if [ "$exit_code" -eq 127 ]; then
  echo "husky - command not found in PATH=$PATH"
fi

exit "$exit_code"
