# Resource Manager & Connection Manager Limits

These guardrails are tuned for AGI Alpha Node traffic so benign peers are not
evicted while abusive bursts are contained.

## Defaults and rationale

- **Global ceilings:** 1,024 connections, 8,192 streams, 512 MiB memory, 2,048
  FDs, and 64 MiB/s bandwidth. Values scale with `NRM_SCALE_FACTOR` and can be
  overridden explicitly.
- **Adaptive watermarks:** If `CONN_LOW_WATER`/`CONN_HIGH_WATER` are not set, the
  connection manager derives them from the global ceiling (low ≈ 50% of
  `maxConnections`, high ≈ 85% with a 10% safety delta). This keeps pruning
  aligned with available headroom instead of static thresholds.
- **Per-protocol grid:** Critical protocols (`/meshsub/1.1.0`, `/ipfs/id/1.0.0`,
  `/ipfs/bitswap/1.2.0`, `agi/control/1.0.0`, `agi/index/1.0.0`) always expose
  usage/limits for dashboards and alerts, even if explicit caps are not set.
- **IP/ASN controls:** Defaults allow 64 connections per IP and 256 per ASN,
  with banlists reflected in `banlist_entries` and `banlist_changes_total`
  metrics for auditability.

## Overriding limits

- **Inline JSON/YAML:** Set `NRM_LIMITS_JSON` to a JSON or simple YAML snippet.
  Example: `NRM_LIMITS_JSON='{"global":{"maxConnections":2048}}'`.
- **File-based overrides:** Point `NRM_LIMITS_PATH` at a limits document (JSON or
  simple `key: value` YAML). A starter template lives at
  `config/rcmgr-limits.sample.json`.
- **Scale factor:** Set `NRM_SCALE_FACTOR` to proportionally stretch or shrink
  every global resource class (connections/streams/memory/fd/bandwidth).
- **Connection watermarks:** Set `CONN_LOW_WATER` and `CONN_HIGH_WATER` to force
  specific pruning thresholds; otherwise the adaptive defaults above are used.

## Validation & testing

- `npm run p2p:load-tests` drives connection/stream pressure to confirm
  `nrm_denials_total`, `nrm_limits`, and `nrm_usage` respond as expected.
- `docker-compose up prom grafana` loads the libp2p unified dashboard with
  threshold lines that mirror PromQL alerts, so blocked rates/latencies are
  visible immediately.
