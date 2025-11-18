# Synthetic load harness report (1k peers)

Command:

```bash
node scripts/p2p-simulator.mjs \
  --nodes 1000 \
  --duration 4 \
  --rate 0.02 \
  --latency 70 \
  --loss 0.005
```

Result snapshot (`docs/load-test-report.json`):

- Nodes: **1000** across topics `agi.jobs`, `agi.control`
- Publish probability: **0.02** per node per tick (100ms)
- Latency baseline: **70ms** with jitter; p50/p95/p99: **100.7 / 285.3 / 399.0 ms**
- Loss probability injected: **0.5%**, observed loss rate: **~0.49%** across a
  fan-out multiplier of **1000x**
- Messages published: **884**; fan-out envelopes: **884,000**; dropped envelopes:
  **4,362**
- Resource envelope: **194.57 MB RSS**, **4,698,526 µs** user CPU over 4s wall time

Interpretation:

- Mesh presets should use the **large** profile to maintain `Dhi=18` / `Dout=48`
  when targeting 1k+ peers.
- Dialer policy should maintain outbound ratio ≥60% with exponential backoff and
  reconcile interval 15s to avoid thrash under partitions.
- The harness can be repeated locally or in CI via `npm run p2p:simulate --
  --nodes 1000 --duration 10 --rate 0.02` to sweep parameters.
