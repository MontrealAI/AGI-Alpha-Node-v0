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

| Event | Primary KPIs Powered |
| ----- | -------------------- |
| `AlphaWUMinted` | Acceptance Rate (AR), On-Time Completion (OTC) |
| `AlphaWUValidated` | Validator-Weighted Quality Score (VQS) |
| `AlphaWUAccepted` | AR / OTC / SAY |
| `SlashApplied` | Slashing-Adjusted Yield (SAY) |

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
  snapshots. Each window records `windowStart` and `windowEnd` UNIX timestamps
  so dashboards can filter by freshness without recomputing aggregations.
- Histogram entities (`QualityBucket`, `LatencyBucket`) keep the raw
  distributions needed to recompute medians and p95s deterministically.

These structures make the four KPIs available per agent, node, and validator
without off-chain joins.

## Telemetry Bootstrapping

Operator identity is already encoded on-chain via the delegated ENS hierarchy.
Subnames under `node.agi.eth`, `alpha.node.agi.eth`, `agent.agi.eth`,
`alpha.agent.agi.eth`, `club.agi.eth`, and `alpha.club.agi.eth` serve as the
admission control layer for KPI emission and validation. The existing
`IdentityRegistry` lookups power:

- **Name-gated submissions** — only authorised agents can mint α‑WU or post
  validator attestations.
- **Validator permissions** — staked validators mapped to `*.alpha.node.agi.eth`
  can issue scores and slashing events.
- **Telemetry toggles** — CI jobs assert that the ENS set matches the authorised
  deployment roster before allowing `isHealthy` to flip to production.

Because these ENS subdomains are active today, no additional oracle, registry,
or allow list contract is required to enforce telemetry hygiene.

## Minimal Wiring Plan

1. **Events spec (no oracle)** — Implement
   [`IAlphaWorkUnitEvents`](../../contracts/interfaces/IAlphaWorkUnitEvents.sol)
   so runtime contracts emit:
   - `AlphaWUMinted(id, agent, node, mintedAt)`
   - `AlphaWUValidated(id, validator, stake, score, validatedAt)`
   - `AlphaWUAccepted(id, acceptedAt)`
   - `SlashApplied(id, validator, amount, slashedAt)`

2. **Index & KPIs** — Feed the above events into the
   [`subgraph/schema.graphql`](../../subgraph/schema.graphql) entities to derive
   each KPI directly from event data:
   - `AcceptanceRate = accepted ÷ minted`
   - `ValidatorWeightedQuality = median(score) × stake weight`
   - `OnTimeCompletion = p95(acceptedAt − mintedAt)`
   - `SlashingAdjustedYield = (accepted − slashUnits) ÷ stake`

3. **Identity gating** — Gate minting, validation, and health toggles through
   the ENS registry described above so only nodes and validators with active
   subnames can submit KPI-impacting transactions.

4. **Safety rails** — Integrate the existing `AGIJobsv0` CI toggles so the
   telemetry mesh emits production events only when the deployment health check
   passes (`isHealthy == true`).

## Dashboard Blueprint

[`docs/telemetry/dashboard.json`](./dashboard.json) serves as the minimal
read-only dashboard contract, and [`alpha-wu-dashboard.min.json`](./alpha-wu-dashboard.min.json)
offers a four-widget starter for rapid pilots. They enumerate:

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
3. **Dashboards** — Load `dashboard.json`, the minimal
   [`alpha-wu-dashboard.min.json`](./alpha-wu-dashboard.min.json), or the extended
   [`alpha-work-unit-dashboard.json`](./alpha-work-unit-dashboard.json) into
   Grafana/Superset for live visibility.
4. **CI guardrails** — Use the identity registry and ENS name-gates to restrict
   who can toggle `isHealthy` and ship telemetry changes via the existing
   `AGIJobsv0` pipelines.

## Quick Wins

- **Publish a KPI subgraph** — Ship a Foundry script or hosted subgraph that
  materialises rolling 7/30-day windows for AR, VQS, OTC, and SAY across agents,
  nodes, and validators using the schema above.
- **Expose a read-only dashboard** — Base implementations on the minimal
  [`alpha-wu-dashboard.min.json`](./alpha-wu-dashboard.min.json) or the extended
  [`alpha-work-unit-dashboard.json`](./alpha-work-unit-dashboard.json) so the
  owner can monitor leaderboards, latency SLOs, and validation health without
  mutating production data sources.
- **Extend CI name-gates** — Wire ENS subname checks into the `isHealthy`
  toggles so unauthorised identities cannot enable or pause telemetry streams.

With this wiring, every α‑WU minted by the network produces verifiable KPI
trails that are consumable on-chain and in observability tooling within
minutes.
