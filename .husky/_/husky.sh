#!/usr/bin/env sh
# shellcheck shell=sh

# Lightweight shim to keep Husky hooks functional even when packages are hoisted or CI skips prepare.
if [ -z "$husky_skip_init" ]; then
  husky_skip_init=1
  export husky_skip_init

  # Ensure local node_modules binaries are available to hooks.
  if [ -d "$(pwd)/node_modules/.bin" ]; then
    PATH="$(pwd)/node_modules/.bin:$PATH"
    export PATH
  fi

  # Respect per-user initialization if present.
  if [ -f "$HOME/.huskyrc" ]; then
    . "$HOME/.huskyrc"
  fi
fi
