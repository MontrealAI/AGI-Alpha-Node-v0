# α‑Work Unit KPI Contract

This note captures the minimal surface required to turn α‑work unit (α‑WU)
execution into on-chain verifiable KPIs. It folds in the canonical events, how
we index them, and the dashboard contract so operators can consume the numbers
without custom wiring.

## KPI Set

**Acceptance Rate (AR)**
: `count(AlphaWUAccepted) ÷ count(AlphaWUMinted)` using minted and accepted logs
  to measure how much work clears validator review.

**Validator-Weighted Quality Score (VQS)**
: `median(score) × stake weight` (per α‑WU, aggregated per actor) combining
  validation logs and validator stake to reward consistent validators while
  damping outliers.

**On-Time Completion (OTC)**
: `p95(acceptedAt − mintedAt)` derived from mint and acceptance timestamps to
  track latency without jitter noise.

**Slashing-Adjusted Yield (SAY)**
: `(accepted − slashUnits) ÷ totalStake` built from accepted unit totals and
  slash logs to reflect post-penalty economics for every stakeholder.

These four KPIs jointly cover correctness, quality, timeliness, and economics.
Because they are derived exclusively from events the contracts already emit,
anyone can recompute them without trusting an oracle.

## Event Interface

Runtime registries should emit the events defined in
[`contracts/interfaces/IAlphaWorkUnitEvents.sol`](../../contracts/interfaces/IAlphaWorkUnitEvents.sol)
(mirrored in [`docs/telemetry/AlphaWorkUnitEvents.sol`](./AlphaWorkUnitEvents.sol)):

- `AlphaWUMinted(id, agent, node, mintedAt)`
- `AlphaWUValidated(id, validator, stake, score, validatedAt)`
- `AlphaWUAccepted(id, acceptedAt)`
- `SlashApplied(id, validator, amount, slashedAt)`

Implementations must gate event emission through ENS subnames such as
`*.agent.agi.eth`, `*.alpha.agent.agi.eth`, `*.node.agi.eth`,
`*.alpha.node.agi.eth`, `*.club.agi.eth`, and `*.alpha.club.agi.eth` by
consulting the shared identity registry. This ensures only authorised agents,
validators, nodes, and operator clubs can generate KPI-impacting telemetry.

## Indexing Model

The Graph schema in [`subgraph/schema.graphql`](../../subgraph/schema.graphql)
extends the raw events into usable analytics windows:

- `WorkUnit` entities capture agent/node ownership, timestamps, and validator
  rosters for each mint.
- `ValidatorParticipation` tracks stake-weighted scoring per validator.
- Daily metric entities (`AgentDailyMetric`, `NodeDailyMetric`,
  `ValidatorDailyMetric`) accumulate counts, scores, stake, and slash totals.
- Rolling window entities (`*MetricWindow`) persist 7/30‑day acceptance rate,
  validator-weighted quality, p95 latency, and slashing-adjusted yield
  snapshots.
- Histogram entities (`QualityBucket`, `LatencyBucket`) keep the raw
  distributions needed to recompute medians and p95s deterministically.

These structures make the four KPIs available per agent, node, and validator
without off-chain joins.

## Dashboard Blueprint

[`docs/telemetry/dashboard.json`](./dashboard.json) serves as the minimal
read-only dashboard contract. It enumerates:

- Prometheus-backed widgets for AR, VQS, OTC, and SAY time series.
- Tables backed by the subgraph for stake-weighted leaderboards.
- A health gate widget wired to the ENS-gated telemetry toggle.
- A latency SLO card targeting 30 minute p95 completion and a bar chart
  rendering validator quality distributions.

The payload conforms to
[`docs/telemetry/dashboard.schema.json`](./dashboard.schema.json) so CI can
validate any future edits with `npx ajv-cli validate`.

## Quick Wiring Checklist

1. **Emit events** — Integrate `IAlphaWorkUnitEvents` in the registry and ensure
   health checks gate production emission.
2. **Index** — Deploy the subgraph using
   [`subgraph/subgraph.yaml`](../../subgraph/subgraph.yaml) and point dashboards
   at the resulting endpoint.
3. **Dashboards** — Load `dashboard.json` or the extended
   [`alpha-work-unit-dashboard.json`](./alpha-work-unit-dashboard.json) into
   Grafana/Superset for live visibility.
4. **CI guardrails** — Use the identity registry and ENS name-gates to restrict
   who can toggle `isHealthy` and ship telemetry changes via the existing
   `AGIJobsv0` pipelines.

With this wiring, every α‑WU minted by the network produces verifiable KPI
trails that are consumable on-chain and in observability tooling within
minutes.
