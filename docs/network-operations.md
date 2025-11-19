# Network operations runbook
<!-- markdownlint-disable MD013 -->

The AGI Alpha Node network stack is instrumented to stay observable and reversible during transport flips, AutoNAT learning, and NRM enforcement. Use this runbook when operating production clusters or CI smoke environments.

## Transport postures (QUIC-only, TCP-only, mixed)

Set posture via environment or Helm values and restart the node. QUIC-first remains the recommended default.

```bash
# QUIC-first with TCP fallback (default)
export TRANSPORT_ENABLE_QUIC=true
export TRANSPORT_ENABLE_TCP=true
export AUTONAT_ENABLED=true

# QUIC-only (preferred for Internet-facing rollouts)
export TRANSPORT_ENABLE_QUIC=true
export TRANSPORT_ENABLE_TCP=false
export AUTONAT_ENABLED=true

# TCP-only (rollback / restrictive firewalls)
export TRANSPORT_ENABLE_QUIC=false
export TRANSPORT_ENABLE_TCP=true
export AUTONAT_ENABLED=false
```

`ENABLE_HOLE_PUNCHING=true` keeps relay/hole-punching online for private peers; disable it only if policy requires it. After posture changes, confirm the plan via `/debug/network` (transport posture tile) or the Prometheus `net_dial_*` counters.

## Reachability and churn panels

- **Reachability timeline** (dashboard: Network posture → Reachability timeline): tracks the AutoNAT/override view of `public | private | unknown`. Flips to `public` after successful AutoNAT probes; prolonged `unknown` means AutoNAT is disabled or starved.
- **Churn & dials**:
  - `opensPerSec` / `closesPerSec` show directional churn. A sustained close rate > open rate signals trims or remote resets.
  - `dials.recent.successRate` reflects QUIC/TCP dial health over the selected window. Drop below 0.98 triggers investigation (DNS, firewall, rcmgr denials).
  - Live counts (`churn.live`) mirror the in-memory connection gauges.

## Detecting DoS/overload via NRM & bans

- `/debug/resources` surfaces per-limit and per-protocol NRM denials (`nrmDenials.byLimitType`, `nrmDenials.byProtocol`) plus connection-manager trims.
- Spikes on `per_protocol` or `streams` limits with matching `connmanager_trims_total` usually indicate a gossip/bitswap surge; raise only the specific protocol caps after confirming workload.
- Ban grid changes appear in `banlist_*` metrics and the `bans` payload; if abuse is concentrated on a single ASN/IP, apply a ban via governance and watch `banlist_changes_total`.

## Confirming dial health during rollouts

1. Flip posture (see above) and redeploy.
2. Watch **Transport posture** and **Dial success (window)** in `/debug/network`:
   - QUIC share should trend toward 100% in QUIC-only mode; TCP-only should show QUIC=0.
   - `dials.recent.successRate` should stabilize ≥0.98 within a few minutes.
3. Verify reachability transitions: the timeline should show `public` (Internet) or `private` (LAN) after AutoNAT probes. If stuck on `unknown`, ensure `AUTONAT_ENABLED` and UDP reachability.
4. If success rate drops, check `nrmDenials` for `limit_type=streams|connections` and `failureReasons` that include `timeout`, `reset`, or `nrm_limit`. Adjust per-protocol limits first; revert transport posture last.

## Quick API references

- `/debug/network?window=15` → transport share, dial success/failure rollups, churn (opens/closes/sec), reachability timeline, and live counts.
- `/debug/resources` → NRM limit grids, usage, denials, connection-manager watermarks/trims, and ban state.
- `/metrics` → Prometheus counters/gauges (`net_dial_*`, `nrm_denials_total`, `connmanager_trims_total`, `banlist_*`).

Use these together: if churn spikes and `nrm_denials_total` climbs for `/meshsub/1.1.0`, trim gossip peers and monitor the dial success rate; if reachability flaps between `public` and `unknown`, prioritize NAT debugging before widening limits.
