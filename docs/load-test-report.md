# Synthetic load harness report (1k peers)

Command:

```bash
node scripts/p2p-simulator.mjs \
  --nodes 1000 \
  --duration 3 \
  --rate 0.01 \
  --latency 60 \
  --loss 0.005
```

Result snapshot (`docs/load-test-report.json`):

- Nodes: **1000** across topics `agi.jobs`, `agi.control`
- Publish probability: **0.01** per node per tick (100ms)
- Latency baseline: **60ms** with jitter; p50/p95/p99: **67.9 / 75.1 / 81.4 ms**
- Loss probability injected: **0.5%**, observed loss rate: **~0.50%** across a
  fan-out multiplier of **1000x**
- Messages published: **526**; fan-out envelopes: **526,000**; dropped envelopes:
  **2,612**
- Resource envelope: **111.91 MB RSS**, **1,305,525 µs** user CPU over 3s wall time

Interpretation:

- Mesh presets should use the **large** profile to maintain `Dhi=18` / `Dout=48`
  when targeting 1k+ peers.
- Dialer policy should maintain outbound ratio ≥60% with exponential backoff and
  reconcile interval 15s to avoid thrash under partitions.
- The harness can be repeated locally or in CI via `npm run p2p:simulate --
  --nodes 1000 --duration 10 --rate 0.02` to sweep parameters.
