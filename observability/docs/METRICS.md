# DCUtR Prometheus Metrics Stub
<!-- markdownlint-disable MD013 -->

This document describes the DCUtR (Direct Connection Upgrade through Relay) metrics scaffold exposed by the AGI Alpha Node runtime. The goal is to wire production-grade Prometheus and Grafana visibility before the punch pipeline goes live.

## Metric catalogue

All DCUtR metrics are labeled with:

- `region` — geographic hint (e.g., `us-east`, `eu-west`).
- `asn` — autonomous system number or provider slug (e.g., `as16509`).
- `transport` — transport negotiated for the punch attempt (`quic`, `tcp`).
- `relay_id` — the relay peer ID guiding the rendezvous.

| Metric | Type | Description |
| --- | --- | --- |
| `dcutr_punch_attempts_total{region,asn,transport,relay_id}` | Counter | Total hole punch attempts coordinated over relays. |
| `dcutr_punch_success_total{region,asn,transport,relay_id}` | Counter | Successful punches that migrated to direct paths. |
| `dcutr_punch_failure_total{region,asn,transport,relay_id}` | Counter | Failed punches that stayed on relays. |
| `dcutr_punch_success_rate{region,asn,transport,relay_id}` | Gauge (computed) | Success ratio derived from attempts and successes; calculated per label set during scrape. |
| `dcutr_time_to_direct_seconds_bucket{region,asn,transport,relay_id}` | Histogram | Seconds from relay rendezvous to confirmed direct path (p50/p95 from buckets). |
| `dcutr_path_quality_rtt_ms{region,asn,transport,relay_id}` | Gauge | Round-trip time for the selected direct path. |
| `dcutr_path_quality_loss_rate{region,asn,transport,relay_id}` | Gauge | Packet loss rate percentage for the direct path. |
| `dcutr_fallback_relay_total{region,asn,transport,relay_id}` | Counter | Connections that stayed on relays after a punch attempt. |
| `dcutr_relay_offload_total{region,asn,transport,relay_id}` | Counter | Connections that offloaded from relay to direct. |
| `dcutr_relay_data_bytes_total{region,asn,transport,relay_id}` | Counter | Bytes transmitted over relays during DCUtR sessions. |
| `dcutr_direct_data_bytes_total{region,asn,transport,relay_id}` | Counter | Bytes transmitted over direct paths post-upgrade. |

Example: `dcutr_punch_success_total{region="us-east",asn="as16509",transport="quic",relay_id="12D3KooW..."} 128`

## Wiring plan

1. Import and register metrics once at process bootstrap:

   ```ts
   import { registerDCUtRMetrics } from '../observability/prometheus/metrics_dcutr.js';
   registerDCUtRMetrics();
   ```

2. Hook emitters into punch lifecycle signals (labels are optional; omitted labels default to `unknown` for stability):

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

3. Expose `/metrics` via your existing Prometheus HTTP handler or Node server.
4. Import `observability/grafana/dcutr_dashboard.json` into Grafana and point panels to your Prometheus datasource.

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

## Health tips

- Keep punch timing aligned with observed RTTs; histogram buckets default to sub-30s to detect jitter.
- Track relay bytes vs direct bytes; growing relay usage is a cost regression.
- Success rate is computed server side—do not hand-roll client math that can drift during scrape races.
- `collectDefaultMetrics` is already called inside `registerDCUtRMetrics`; avoid duplicate registration to keep CI green.
