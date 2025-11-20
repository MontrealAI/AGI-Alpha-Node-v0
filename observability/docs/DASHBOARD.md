# DCUtR Grafana Dashboard Stub
<!-- markdownlint-disable MD013 -->

Import `observability/grafana/dcutr_dashboard.json` into Grafana to visualize the hole punching control loop.

## Panels

1. **Punch Success %** — live gauge sourced from `dcutr_punch_success_rate`.
2. **Attempts vs Success vs Failure** — compare per-5m rates of attempts, successes, and failures.
3. **Time to Direct p50/p95** — quantiles over `dcutr_time_to_direct_seconds_bucket` to catch latency drift.
4. **Path Quality (RTT & Loss)** — direct path quality gauges for jitter and loss anomalies.
5. **Relay vs Direct Data** — bytes per second over relay vs direct paths to surface cost regressions.
6. **Relay Fallback vs Offload** — rate of connections sticking to relays or leaving them.

## Import steps

1. Navigate to **Dashboards → New → Import** in Grafana.
2. Upload `observability/grafana/dcutr_dashboard.json` or paste its JSON payload.
3. Select your Prometheus datasource and save.
4. (Optional) Add alert rules for p95 `dcutr_time_to_direct_seconds` and falling `dcutr_punch_success_rate`.

## Topology

```mermaid
flowchart TB
  classDef neon fill:#0b1120,stroke:#22c55e,stroke-width:2px,color:#e2e8f0;
  classDef lava fill:#0b1120,stroke:#f97316,stroke-width:2px,color:#ffedd5;
  classDef frost fill:#0b1120,stroke:#0ea5e9,stroke-width:2px,color:#e0f2fe;

  subgraph Edge[Edge Nodes]
    Punchr[DCUtR punchers]:::lava
  end

  subgraph Observability[Observability Spine]
    Metrics[Prometheus scrape]:::frost
    Grafana[Grafana cockpit]:::neon
  end

  Punchr -->|emit counters/gauges| Metrics
  Metrics -->|query| Grafana
```
