#!/bin/sh
set -euo pipefail

log() {
  printf '[entrypoint] %s\n' "$*" >&2
}

is_truthy() {
  if [ "${1:-}" = "" ]; then
    return 1
  fi
  case "$(printf '%s' "$1" | tr '[:upper:]' '[:lower:]')" in
    1|true|yes|on)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

assert_positive_integer() {
  case "$1" in
    ''|*[!0-9]*|0)
      log "$2 must be a positive integer"
      exit 1
      ;;
  esac
}

load_config_file() {
  if [ "${CONFIG_PATH:-}" = "" ]; then
    return
  fi

  if [ ! -f "$CONFIG_PATH" ]; then
    log "CONFIG_PATH set to '$CONFIG_PATH' but file not found"
    exit 1
  fi

  log "loading configuration from $CONFIG_PATH"
  # shellcheck disable=SC1090
  . "$CONFIG_PATH"
}

prepare_environment() {
  export ENS_PARENT_DOMAIN="${ENS_PARENT_DOMAIN:-alpha.node.agi.eth}"

  if [ "${NODE_LABEL:-}" = "" ]; then
    log "NODE_LABEL must be exported before launch"
    exit 1
  fi

  if [ "${OPERATOR_ADDRESS:-}" = "" ]; then
    log "OPERATOR_ADDRESS must be exported before launch"
    exit 1
  fi

  if [ "${RPC_URL:-}" = "" ]; then
    log "RPC_URL must be exported before launch"
    exit 1
  fi

  if [ "${OFFLINE_SNAPSHOT_PATH:-}" != "" ] && [ ! -f "$OFFLINE_SNAPSHOT_PATH" ]; then
    log "OFFLINE_SNAPSHOT_PATH set to '$OFFLINE_SNAPSHOT_PATH' but file not found"
  fi

  if [ "${MONITOR_INTERVAL:-}" != "" ]; then
    assert_positive_integer "$MONITOR_INTERVAL" "MONITOR_INTERVAL"
  fi
}

run_container() {
  load_config_file
  prepare_environment

  if [ "${NODE_LABEL:-}" != "" ]; then
    log "bootstrap ${NODE_LABEL}.${ENS_PARENT_DOMAIN} for operator ${OPERATOR_ADDRESS}"
  fi

  if [ "${MONITOR_INTERVAL:-}" != "" ]; then
    set -- "--interval" "$MONITOR_INTERVAL" "$@"
  fi

  if is_truthy "${SKIP_MONITOR:-}"; then
    set -- "--skip-monitor" "$@"
  fi

  if is_truthy "${RUN_ONCE:-}"; then
    set -- "--once" "$@"
  fi

  if [ "${OFFLINE_SNAPSHOT_PATH:-}" != "" ]; then
    set -- "--offline-snapshot" "$OFFLINE_SNAPSHOT_PATH" "$@"
  fi

  if is_truthy "${OFFLINE_MODE:-}"; then
    set -- "--offline-mode" "$@"
  fi

  if [ "${PROJECTED_REWARDS:-}" != "" ]; then
    set -- "--projected-rewards" "$PROJECTED_REWARDS" "$@"
  fi

  exec node src/index.js container "$@"
}

if [ "$#" -eq 0 ]; then
  run_container
fi

case "$1" in
  container)
    shift
    run_container "$@"
    ;;
  -* )
    run_container "$@"
    ;;
  sh|/bin/sh|bash|/bin/bash|node|npm)
    exec "$@"
    ;;
  status|monitor|ens-guide|verify-ens|stake-activate|token|economics|jobs)
    load_config_file
    exec node src/index.js "$@"
    ;;
  *)
    exec "$@"
    ;;
esac
