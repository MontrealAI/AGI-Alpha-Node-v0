#!/bin/sh
set -euo pipefail

if [ "${OFFLINE_SNAPSHOT_PATH:-}" != "" ] && [ ! -f "$OFFLINE_SNAPSHOT_PATH" ]; then
  echo "[entrypoint] OFFLINE_SNAPSHOT_PATH set to '$OFFLINE_SNAPSHOT_PATH' but file not found" >&2
fi

if [ "${NODE_LABEL:-}" = "" ] || [ "${OPERATOR_ADDRESS:-}" = "" ]; then
  echo "[entrypoint] NODE_LABEL and OPERATOR_ADDRESS must be exported before launch" >&2
  exit 1
fi

echo "[entrypoint] launching AGI Alpha Node runtime"
exec node src/index.js container "$@"
