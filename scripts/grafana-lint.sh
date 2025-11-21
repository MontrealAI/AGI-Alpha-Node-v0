#!/usr/bin/env bash
set -euo pipefail

DASHBOARD_PATH=${1:-observability/grafana/dcutr_dashboard.json}
GRAFANA_IMAGE=${GRAFANA_IMAGE:-grafana/grafana-oss:11.2.0}

if [[ ! -f "${DASHBOARD_PATH}" ]]; then
  echo "[grafana-lint] dashboard file not found: ${DASHBOARD_PATH}" >&2
  exit 1
fi

ROOT_DIR=$(pwd)
DASHBOARD_ABS="${ROOT_DIR}/${DASHBOARD_PATH}"

lint_with_node() {
node --input-type=module <<'NODE'
import { readFileSync } from 'node:fs';

const dashboardPath = process.env.DASHBOARD_ABS;
const payload = JSON.parse(readFileSync(dashboardPath, 'utf8'));
const errors = [];

if (!payload.uid) errors.push('missing uid');
if (!payload.title) errors.push('missing title');
if (!Array.isArray(payload.panels) || payload.panels.length === 0) {
  errors.push('panels array missing or empty');
}

(payload.panels || []).forEach((panel, idx) => {
  if (typeof panel.id !== 'number') errors.push(`panel[${idx}] missing numeric id`);
  if (!panel.type) errors.push(`panel[${idx}] missing type`);
  if (!panel.datasource || !panel.datasource.type) errors.push(`panel[${idx}] missing datasource type`);
  if (!Array.isArray(panel.targets) || panel.targets.length === 0) {
    errors.push(`panel[${idx}] missing targets`);
  } else {
    panel.targets.forEach((t, tIdx) => {
      if (!t.expr || typeof t.expr !== 'string') errors.push(`panel[${idx}].target[${tIdx}] missing expr`);
    });
  }
});

if (errors.length) {
  console.error(`[grafana-lint] structural validation failed: ${errors.join('; ')}`);
  process.exit(1);
}

console.log(`[grafana-lint] JSON structure validated (${payload.panels.length} panels)`);
NODE
}

run_grafana_cli() {
  local bin="$1"
  local path="$2"
  if "$bin" cli dashboards lint "$path"; then
    return 0
  fi
  return 1
}

if command -v docker >/dev/null 2>&1; then
  echo "[grafana-lint] linting ${DASHBOARD_PATH} using ${GRAFANA_IMAGE} (docker)"
  if docker run --rm \
    -v "${DASHBOARD_ABS}:/tmp/dcutr_dashboard.json:ro" \
    "${GRAFANA_IMAGE}" \
    grafana cli dashboards lint /tmp/dcutr_dashboard.json; then
    exit 0
  else
    echo "[grafana-lint] dockerized Grafana CLI unavailable; falling back to structural lint"
    DASHBOARD_ABS="${DASHBOARD_ABS}" lint_with_node
    exit $?
  fi
fi

WORKDIR=$(mktemp -d)
ARCHIVE_URL=${GRAFANA_ARCHIVE_URL:-https://dl.grafana.com/oss/release/grafana-11.2.0.linux-amd64.tar.gz}
ARCHIVE_PATH="${WORKDIR}/grafana.tar.gz"
echo "[grafana-lint] docker not found; fetching Grafana CLI from ${ARCHIVE_URL}"
trap 'rm -rf "${WORKDIR}"' EXIT

curl -fsSL "${ARCHIVE_URL}" -o "${ARCHIVE_PATH}"
tar -xzf "${ARCHIVE_PATH}" -C "${WORKDIR}"

GRAFANA_BIN=$(find "${WORKDIR}" -type f -name grafana | head -n 1)

if [[ -n "${GRAFANA_BIN}" && -x "${GRAFANA_BIN}" ]]; then
  echo "[grafana-lint] linting ${DASHBOARD_PATH} using downloaded Grafana CLI"
  if run_grafana_cli "${GRAFANA_BIN}" "${DASHBOARD_ABS}"; then
    exit 0
  else
    echo "[grafana-lint] downloaded Grafana CLI missing dashboards lint; falling back to structural lint"
  fi
else
  echo "[grafana-lint] unable to locate grafana binary in ${WORKDIR}; falling back to structural lint"
fi

DASHBOARD_ABS="${DASHBOARD_ABS}" lint_with_node
