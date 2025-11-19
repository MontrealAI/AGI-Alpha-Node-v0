# Network Operations Runbook

<!-- markdownlint-disable MD013 MD033 -->

This runbook distills the network posture controls, debug overlays, and dashboard tiles operators need for the AGI Alpha Node runtime.

## Transport posture switches (QUIC-first by default)

| Mode | Environment overrides | Notes |
| --- | --- | --- |
| QUIC-only | `TRANSPORT_ENABLE_QUIC=true`<br/>`TRANSPORT_ENABLE_TCP=false` | Fastest path; preferred when NAT traversal is healthy. |
| TCP-only | `TRANSPORT_ENABLE_QUIC=false`<br/>`TRANSPORT_ENABLE_TCP=true` | Fallback for QUIC-blocked environments. |
| Mixed (QUIC-first) | `TRANSPORT_ENABLE_QUIC=true`<br/>`TRANSPORT_ENABLE_TCP=true` | Default: QUIC with TCP safety net. |

Apply overrides via the process environment or a systemd unit drop-in, then restart the node. The libp2p transport planner validates that at least one transport stays enabled and logs the resolved dial preference on boot.

```bash
# Example: force QUIC-only on a fleet
export TRANSPORT_ENABLE_QUIC=true
export TRANSPORT_ENABLE_TCP=false
node src/index.js
```

> The reachability tracker honours manual overrides: set `AUTONAT_ENABLED=false` to freeze the state, or keep it on for self-assessment.

## Debugging surfaces to bookmark

- `GET /debug/network?window=15` — reachability timeline, live connection churn (opens/sec, closes/sec), dial success/failure by transport, and transport share for the window.
- `GET /debug/resources?window=15` — normalized resource limits/usage grids, NRM denials (by limit type & protocol) with per-second rates, and connection manager trims by reason.
- `GET /metrics` — Prometheus exposition (dial, protocol latency, NRM/bans, ConnMgr trims).

All endpoints remain read-only and API-key gated; responses are JSON shaped for dashboards and copy/paste into incident notes.

## Reading the dashboard tiles

- **Transport posture**: Doughnut chart of QUIC/TCP (and relay/other, if present) share over the last window. Expect QUIC dominance when `TRANSPORT_ENABLE_QUIC=true`.
- **Reachability timeline**: Step-line series mapped to `public=2`, `private=1`, `unknown=0`. Sustained zeros usually means AutoNAT is disabled or blocked.
- **Resource pressure**: Stacked bars of `nrm_denials_total` by limit type and protocol plus connection trims. Rising trims + rising denials implies the Connection Manager is actively shedding load.
- **Churn & dials**: Bar charts for opens/closes per second and dial attempts per transport; success rate is annotated (recent + cumulative) to spot rollout regressions quickly.

## Detecting DoS or overload

1. Check `/debug/resources`: spikes in `nrmDenials.recent.byLimitType.fd` or `memory` indicate exhaustion; protocol-heavy spikes (e.g., `/meshsub/1.1.0`) are per-protocol DoS candidates.
2. Inspect `connectionManagerStats.recent.byReason`: frequent `high_water` trims confirm the Connection Manager is defending watermarks.
3. Validate dial success: in `/debug/network`, a drop in `dials.recent.successRate` for QUIC but not TCP suggests UDP/QUIC filtering; switch to TCP-only temporarily if needed.
4. Ban abusive origins: use the governance ban APIs to block offending IPs/peers/ASNs; the ban grid in `/debug/resources` updates immediately for auditability.

## Rolling out to a new neighbourhood

1. Set the target transport mix (QUIC-first recommended) and confirm the plan in logs on startup.
2. Watch the **Churn & dials** tile: success rates per transport should stay ≥98% and opens/closes should stabilise after initial peer discovery.
3. Watch the **Reachability timeline**: reachability should settle on `public` or `private` consistently; flapping suggests NAT traversal issues.
4. If rcmgr denials spike for the rollout protocol, raise the specific per-protocol caps instead of global caps and recheck `/debug/resources`.

## Quick incident drill

```bash
# Snapshot the last 15 minutes of posture
curl -H "x-api-key: $API_KEY" "$BASE_URL/debug/network?window=15" | jq '.reachability, .churn, .dials'

# Capture NRM denials and connection trims
curl -H "x-api-key: $API_KEY" "$BASE_URL/debug/resources?window=15" | jq '.nrmDenials, .connectionManagerStats'
```

Record the window, limit type, protocol, and transport implicated; triage by narrowing the transport mix (QUIC-only or TCP-only) and tightening protocol-specific caps before adjusting globals.
