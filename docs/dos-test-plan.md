# DoS Defense Test Plan (Resource & Connection Management)

## Objectives

- Validate Network Resource Manager (NRM) ceilings for connections, streams, memory,
  file descriptors, and bandwidth.
- Confirm connection manager trimming preserves high-score/pinned peers while evicting
  lowest-value peers first.
- Enforce per-IP limits and ban hooks for rapid Sybil/DoS mitigation.
- Exercise abuse scenarios (connection floods, stream floods, malformed gossip)
  without crashing the node.

## Configuration knobs

- `NRM_SCALE_FACTOR` (0.1–5.0): scales default global limits
  (conns/streams/memory/FDs/bandwidth).
- `NRM_LIMITS_JSON` / `NRM_LIMITS_PATH`: inline or file-based JSON/YAML
  overrides for `{ global, perProtocol, perPeer }` caps.
- `MAX_CONNS_PER_IP`: per-IP ceiling before new dials are rejected.
- `CONN_LOW_WATER` / `CONN_HIGH_WATER` / `CONN_GRACE_PERIOD_SEC`: conn manager trim
  thresholds and grace period.

## Test commands

- **Resource/abuse harness**: `npm run p2p:load-tests`
  - Drives connection floods, stream floods, and malformed gossip simulations.
- **Full CI mirror**: `npm run ci:verify` (runs lint, tests, coverage,
  Solidity, subgraph, audit, policy, branch gates).

## Expected outcomes

- Connection floods hit `global.maxConnections` or `maxConnsPerIp` and return
  denials instead of crashing.
- Stream floods respect per-protocol/per-peer caps; banned peers cannot open new
  streams.
- Connection manager trims until peers ≤ `low_water`, keeping pinned/high-score
  peers connected.
- Denial reasons (`global-connection-cap`, `per-ip-cap`, `per-protocol-cap`,
  `banned`) appear in logs/metrics for observability.
- Malformed gossip simulations flag peers that breach the penalty threshold
  without destabilizing the process.

## Observability

- Structured logs from `resource-manager-config` and `libp2p-host-config` emit
  limit summaries and denial reasons.
- `buildAbuseHarness` exposes counts of accepted/denied attempts and reason
  tallies for dashboards/alerts.
