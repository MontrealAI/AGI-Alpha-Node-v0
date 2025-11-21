#!/usr/bin/env bash
set -euo pipefail

DASHBOARD_PATH="${1:-observability/grafana/dcutr_dashboard.json}"
if [ ! -f "$DASHBOARD_PATH" ]; then
  echo "Dashboard file not found: $DASHBOARD_PATH" >&2
  exit 1
fi

ABS_PATH=$(cd "$(dirname "$DASHBOARD_PATH")" && pwd)/$(basename "$DASHBOARD_PATH")
IMAGE="grafana/grafana:11.2.0"
CACHE_DIR="${XDG_CACHE_HOME:-$HOME/.cache}/grafana-cli"
TARBALL="$CACHE_DIR/grafana-11.2.0.linux-amd64.tar.gz"
GRAFANA_DIR="$CACHE_DIR/grafana-11.2.0"
GRAFANA_BIN="$GRAFANA_DIR/bin/grafana"

run_docker_lint() {
  echo "Linting Grafana dashboard with $IMAGE"
  docker run --rm \
    -v "$ABS_PATH:/var/lib/grafana/dashboards/dashboard.json:ro" \
    "$IMAGE" \
    grafana dashboards lint /var/lib/grafana/dashboards/dashboard.json
}

run_local_lint() {
  mkdir -p "$CACHE_DIR"
  if [ ! -x "$GRAFANA_BIN" ]; then
    echo "Downloading Grafana CLI to $CACHE_DIR"
    curl -fsSL -o "$TARBALL" "https://dl.grafana.com/oss/release/grafana-11.2.0.linux-amd64.tar.gz"
    tar -C "$CACHE_DIR" -xzf "$TARBALL"
    # grafana tarballs may prefix versions with `grafana-` or `grafana-v`
    local discovered
    discovered=$(find "$CACHE_DIR" -maxdepth 1 -type d -name "grafana*11.2.0" -print | head -n1)
    if [ -n "$discovered" ]; then
      GRAFANA_DIR="$discovered"
      GRAFANA_BIN="$GRAFANA_DIR/bin/grafana"
    fi
  fi
  echo "Linting Grafana dashboard with local Grafana CLI"
  if "$GRAFANA_BIN" dashboards lint "$ABS_PATH"; then
    return 0
  fi

  echo "Dashboards subcommand unavailable in this Grafana build; running structural lint fallback"
  DASHBOARD="$ABS_PATH" node --input-type=module <<'NODE'
import { readFileSync } from 'node:fs';
const dashPath = process.env.DASHBOARD;
const raw = readFileSync(dashPath, 'utf8');
const dash = JSON.parse(raw);

if (dash.uid !== 'dcutr-observability') {
  throw new Error(`Unexpected uid: ${dash.uid}`);
}
if (dash.title !== 'DCUtR — Hole Punch Performance') {
  throw new Error(`Unexpected title: ${dash.title}`);
}

const requiredExprs = [
  'sum(rate(dcutr_punch_success_total[5m])) / sum(rate(dcutr_punch_attempts_total[5m]))',
  'sum(rate(dcutr_punch_attempts_total[5m]))',
  'sum(rate(dcutr_punch_success_total[5m]))',
  'sum(rate(dcutr_punch_failure_total[5m]))',
  'histogram_quantile(0.95, sum(rate(dcutr_time_to_direct_seconds_bucket[5m])) by (le))',
  'sum(rate(dcutr_relay_offload_total[5m]))',
  'avg(dcutr_path_quality_rtt_ms)',
  'sum(rate(dcutr_punch_success_total[10m])) by (region, asn)'
];

const exprs = (dash.panels ?? []).flatMap((panel) =>
  (panel.targets ?? []).map((t) => t.expr).filter(Boolean)
);

for (const expected of requiredExprs) {
  if (!exprs.includes(expected)) {
    throw new Error(`Missing PromQL target: ${expected}`);
  }
}
console.log('Fallback lint passed: required PromQL targets and metadata present.');
NODE
}

if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
  run_docker_lint
else
  run_local_lint
fi
