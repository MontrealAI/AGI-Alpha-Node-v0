# DCUtR Prometheus Metrics Stub
<!-- markdownlint-disable MD013 -->

This document specifies the Direct Connection Upgrade through Relay (DCUtR) telemetry surface exposed by the AGI Alpha Node runtime. It aligns with the DCUtR primer in the README and feeds the Grafana dashboard stub under `observability/grafana/dcutr_dashboard.json`.

## Labels

Every metric shares the same cardinality grid so drill-downs stay consistent:

- `region` — geographic hint such as `us-east` or `eu-west`.
- `asn` — autonomous system number or provider slug (for example `as16509`).
- `transport` — negotiated transport (`quic` or `tcp`).
- `relay_id` — relay peer ID coordinating the rendezvous.

## Metric descriptions

Every counter/gauge/histogram is wired for production slices and shares the common label grid (`region`, `asn`, `transport`, `relay_id`).

Metric catalogue (all metrics accept `{region,asn,transport,relay_id}`):

- **Attempts** (`dcutr_punch_attempts_total`) — punch coordination attempts started via a relay rendezvous.
- **Success** (`dcutr_punch_success_total`) — attempts that migrated traffic off the relay to a direct path.
- **Failure** (`dcutr_punch_failure_total`) — attempts that never converged on a direct path (typically due to NAT/firewall posture).
- **Success rate** (`dcutr_punch_success_rate`) — computed gauge that divides successes by attempts on scrape, pinned to `0` when no attempts are recorded to avoid flapping dashboards.
- **Time-to-direct** (`dcutr_time_to_direct_seconds_bucket`) — histogram capturing wall-clock seconds from rendezvous to confirmed direct path; drive p50/p95.
- **Direct quality** (`dcutr_path_quality_rtt_ms`, `dcutr_path_quality_loss_rate`) — RTT and packet-loss gauges post-upgrade.
- **Relay posture** (`dcutr_fallback_relay_total`, `dcutr_relay_offload_total`) — whether sessions stuck to relays or successfully offloaded.
- **Volume mix** (`dcutr_relay_data_bytes_total`, `dcutr_direct_data_bytes_total`) — traffic split between relays and direct paths to surface cost regressions.

| Metric | Type | Description |
| --- | --- | --- |
| `dcutr_punch_attempts_total{region,asn,transport,relay_id}` | Counter | Coordinated hole punch attempts over relays. |
| `dcutr_punch_success_total{region,asn,transport,relay_id}` | Counter | Successful punches that migrated to a direct path. |
| `dcutr_punch_failure_total{region,asn,transport,relay_id}` | Counter | Punch attempts that failed and stayed on the relay. |
| `dcutr_punch_success_rate{region,asn,transport,relay_id}` | Gauge (computed) | Derived success ratio per label set during scrape time. |
| `dcutr_time_to_direct_seconds_bucket{region,asn,transport,relay_id}` | Histogram | Wall-clock seconds from relay rendezvous to confirmed direct path (p50/p95 from buckets). |
| `dcutr_path_quality_rtt_ms{region,asn,transport,relay_id}` | Gauge | Round-trip time for the elected direct path. |
| `dcutr_path_quality_loss_rate{region,asn,transport,relay_id}` | Gauge | Packet loss rate percentage for the direct path. |
| `dcutr_fallback_relay_total{region,asn,transport,relay_id}` | Counter | Connections that remained on relays after an attempted punch. |
| `dcutr_relay_offload_total{region,asn,transport,relay_id}` | Counter | Connections that successfully offloaded from relay to direct. |
| `dcutr_relay_data_bytes_total{region,asn,transport,relay_id}` | Counter | Bytes transmitted over relays during DCUtR sessions. |
| `dcutr_direct_data_bytes_total{region,asn,transport,relay_id}` | Counter | Bytes transmitted over direct paths after upgrade. |

Example emission: `dcutr_punch_success_total{region="us-east",asn="as16509",transport="quic",relay_id="12D3KooW..."} 128`

## Ops SLO mapping

- **Punch success rate** → `dcutr_punch_success_rate` (top-line KPI, slice by `region × asn × transport`).
- **Time-to-direct** → histogram p95 of `dcutr_time_to_direct_seconds_bucket` (alert on drift > 2× baseline).
- **Relay offload %** → `dcutr_relay_offload_total` ÷ `dcutr_punch_attempts_total` (ratio computed in Grafana).
- **Direct path quality** → `dcutr_path_quality_rtt_ms` and `dcutr_path_quality_loss_rate` compared against relay baselines.
- **Fallback pressure** → `dcutr_fallback_relay_total` paired with `dcutr_punch_failure_total` to catch symmetric NAT pockets.

## Wiring plan

1. Register metrics once at bootstrap (includes `collectDefaultMetrics`):

   ```ts
   import { registerDCUtRMetrics } from '../observability/prometheus/metrics_dcutr.js';
   registerDCUtRMetrics();
   ```

2. Emit lifecycle events with optional labels (missing labels default to `unknown` to keep scrapes stable):

   ```ts
   import {
     onPunchStart,
     onPunchSuccess,
     onPunchFailure,
     onPunchLatency,
     onDirectRttMs,
     onDirectLossRate,
     onRelayFallback,
     onRelayOffload,
     onRelayBytes,
     onDirectBytes,
   } from '../observability/prometheus/metrics_dcutr.js';

   const labels = { region: 'us-east', asn: 'as16509', transport: 'quic', relay_id: '12D3KooW...' };

   onPunchStart(labels);
   onPunchSuccess(labels);
   onPunchFailure(labels);
   onPunchLatency(1.42, labels);
   onDirectRttMs(32, labels);
   onDirectLossRate(0.4, labels);
   onRelayFallback(labels);
   onRelayOffload(labels);
   onRelayBytes(2048, labels);
   onDirectBytes(8192, labels);
   ```

3. Expose `/metrics` through your existing Prometheus HTTP handler.
4. Import `observability/grafana/dcutr_dashboard.json` into Grafana and bind it to your Prometheus datasource.

## Diagram

```mermaid
flowchart LR
  classDef neon fill:#0b1120,stroke:#22c55e,stroke-width:2px,color:#e2e8f0;
  classDef lava fill:#0b1120,stroke:#f97316,stroke-width:2px,color:#ffedd5;
  classDef frost fill:#0b1120,stroke:#0ea5e9,stroke-width:2px,color:#e0f2fe;

  P2P[libp2p DCUtR\n(punch events)]:::lava --> Emit[metrics_dcutr emitters\n(onPunch*, onRelay*)]:::neon
  Emit --> Registry[Prometheus registry\n(custom + default metrics)]:::frost
  Registry --> Scrape[Prometheus server\n/metrics scrape]:::frost
  Scrape --> Grafana[Grafana panels\ndcutr_dashboard.json]:::lava
  Grafana --> Ops[Ops cockpit\nalerts + SLOs]:::neon
```

## Health and debugging tips

- Align punch timing windows with observed RTTs; the histogram buckets default to sub-30s so you can see jitter early.
- Track relay bytes vs direct bytes; climbing relay usage signals cost regression or blocked transports.
- Trust the computed `dcutr_punch_success_rate` instead of client-side math to avoid scrape race drift.
- `collectDefaultMetrics` is already invoked inside `registerDCUtRMetrics`; avoid double-registration to keep CI green.
- When success rates crater in a single region/ASN, compare `transport` splits to decide whether to flip to TCP temporarily.
