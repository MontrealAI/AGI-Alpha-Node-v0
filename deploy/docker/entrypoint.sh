#!/bin/sh
set -euo pipefail

CONFIG_DEFAULT="/config/node.env"

if [ "${CONFIG_PATH:-}" = "" ] && [ -f "$CONFIG_DEFAULT" ]; then
  echo "[entrypoint] CONFIG_PATH not provided – defaulting to $CONFIG_DEFAULT"
  CONFIG_PATH="$CONFIG_DEFAULT"
fi

if [ "${CONFIG_PATH:-}" != "" ]; then
  if [ ! -f "$CONFIG_PATH" ]; then
    echo "[entrypoint] CONFIG_PATH set to '$CONFIG_PATH' but file not found" >&2
    exit 1
  fi
  echo "[entrypoint] Loading configuration from $CONFIG_PATH"
  set -a
  # shellcheck disable=SC1090
  . "$CONFIG_PATH"
  set +a
fi

ENS_PARENT_DOMAIN="${ENS_PARENT_DOMAIN:-alpha.node.agi.eth}"

if [ "${OFFLINE_SNAPSHOT_PATH:-}" != "" ] && [ ! -f "$OFFLINE_SNAPSHOT_PATH" ]; then
  echo "[entrypoint] OFFLINE_SNAPSHOT_PATH set to '$OFFLINE_SNAPSHOT_PATH' but file not found" >&2
fi

NODE_LABEL="${NODE_LABEL:-}"
OPERATOR_ADDRESS="${OPERATOR_ADDRESS:-}"
RPC_URL="${RPC_URL:-}"

if [ "$NODE_LABEL" = "" ] || [ "$OPERATOR_ADDRESS" = "" ]; then
  echo "[entrypoint] NODE_LABEL and OPERATOR_ADDRESS must be exported before launch" >&2
  exit 1
fi

if printf '%s' "$NODE_LABEL" | grep -q '\.'; then
  echo "[entrypoint] NODE_LABEL should be a label (e.g. '1') – omit the parent domain" >&2
  exit 1
fi

if ! printf '%s' "$NODE_LABEL" | grep -Eq '^[a-z0-9-]+$'; then
  echo "[entrypoint] NODE_LABEL must contain only lowercase letters, numbers, or dashes" >&2
  exit 1
fi

if ! printf '%s' "$OPERATOR_ADDRESS" | grep -Eq '^0x[0-9a-fA-F]{40}$'; then
  echo "[entrypoint] OPERATOR_ADDRESS must be a valid Ethereum address (0x-prefixed hex)" >&2
  exit 1
fi

if [ "$RPC_URL" = "" ]; then
  echo "[entrypoint] RPC_URL must be exported before launch" >&2
  exit 1
fi

METRICS_PORT="${METRICS_PORT:-9464}"
API_PORT="${API_PORT:-8080}"

RPC_LOG_VALUE="[redacted]"
if [ "$RPC_URL" != "" ]; then
  RPC_LOG_VALUE=$(printf '%s' "$RPC_URL" \
    | sed -E 's#://[^/@]+@#://***@#' \
    | sed -E 's#^([a-zA-Z][a-zA-Z0-9+.-]*://[^/]+)/?.*#\1/...#')
  if [ "$RPC_LOG_VALUE" = "$RPC_URL" ]; then
    case "$RPC_URL" in
      unix://*)
        RPC_LOG_VALUE="unix://..."
        ;;
      *)
        RPC_LOG_VALUE="[redacted]"
        ;;
    esac
  fi
fi

echo "[entrypoint] configuration summary"
printf '  node: %s.%s\n' "$NODE_LABEL" "$ENS_PARENT_DOMAIN"
printf '  operator: %s\n' "$OPERATOR_ADDRESS"
printf '  rpc: %s\n' "$RPC_LOG_VALUE"
printf '  metrics_port: %s\n' "$METRICS_PORT"
printf '  api_port: %s\n' "$API_PORT"

if [ "${AUTO_STAKE:-}" = "true" ] && [ "${OPERATOR_PRIVATE_KEY:-}" = "" ]; then
  echo "[entrypoint] WARNING: AUTO_STAKE is enabled but OPERATOR_PRIVATE_KEY is not set; staking cannot be broadcast." >&2
fi

echo "[entrypoint] launching AGI Alpha Node runtime"
exec node src/index.js container "$@"
