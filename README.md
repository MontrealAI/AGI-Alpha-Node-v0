# AGI Alpha Node v0 · Sovereign Cognition Spine ⚡

<!-- markdownlint-disable MD013 MD033 -->
<p align="center">
  <picture>
    <source srcset="1.alpha.node.agi.eth.svg" type="image/svg+xml" />
    <img
      src="1.alpha.node.agi.eth.png"
      alt="AGI Alpha Node Crest"
      width="256"
      loading="lazy"
      decoding="async"
    />
  </picture>
</p>

<p align="center">
  <a href="https://github.com/MontrealAI/AGI-Alpha-Node-v0/actions/workflows/ci.yml">
    <img src="https://github.com/MontrealAI/AGI-Alpha-Node-v0/actions/workflows/ci.yml/badge.svg?branch=main" alt="Build" />
  </a>
  <img src="https://img.shields.io/badge/Coverage-Automated-0e9aa7?logo=codecov&logoColor=white" alt="Coverage" />
  <img src="https://img.shields.io/badge/Node.js-20.x-43853d?logo=node.js&logoColor=white" alt="Runtime" />
  <a href="Dockerfile">
    <img src="https://img.shields.io/badge/Docker-Production%20Image-2496ed?logo=docker&logoColor=white" alt="Docker" />
  </a>
  <a href="deploy/helm/agi-alpha-node">
    <img src="https://img.shields.io/badge/Helm-Chart-0ea5e9?logo=helm&logoColor=white" alt="Helm" />
  </a>
  <a href="https://etherscan.io/address/0xa61a3b3a130a9c20768eebf97e21515a6046a1fa">
    <img src="https://img.shields.io/badge/$AGIALPHA-0xa61a3b3a130a9c20768eebf97e21515a6046a1fa-ff3366?logo=ethereum&logoColor=white" alt="$AGIALPHA" />
  </a>
  <a href="LICENSE">
    <img src="https://img.shields.io/badge/License-MIT-0e9aa7" alt="MIT" />
  </a>
</p>

> The command spine for validator-weighted α-work units, ENS sovereignty, and on-chain telemetry—engineered to keep an iconic operator in total control.

---

## Table of Contents

1. [Introduction](#introduction)
2. [Architecture](#architecture)
3. [Smart Contracts](#smart-contracts)
4. [Telemetry](#telemetry)
5. [Dashboards](#dashboards)
6. [Deployment](#deployment)
7. [Continuous Integration](#continuous-integration)
8. [Governance](#governance)
9. [Quickstart](#quickstart)

---

## Introduction

AGI Alpha Node v0 is the sovereign orchestration layer for validator-weighted α-work units (α-WU). It fuses CLI-level command, ENS-bound identity, smart contract automation, and telemetry streaming into a single futuristic runtime that the owner can pause, reconfigure, or redeploy in seconds.

* **Purpose:** Enforce deterministic lifecycle management for alpha job registries, validators, and treasury flows.
* **Scope:** Repository spans the [Node.js runtime](src), [Solidity surfaces](contracts), [telemetry specs](docs/telemetry), and [deployment automation](deploy/helm/agi-alpha-node).
* **Tone:** Iconic, powerful, and pragmatic—every artifact is wired to maximize operator leverage.

---

## Architecture

The runtime stitches CLI directives, orchestration services, and telemetry exporters into a layered control plane. Core modules live under [`src/`](src) with TypeScript-friendly JavaScript, job logic, and governance rails.

```mermaid
flowchart LR
  classDef control fill:#111827,stroke:#4c1d95,stroke-width:2px,color:#f8fafc;
  classDef runtime fill:#0f172a,stroke:#06b6d4,stroke-width:2px,color:#f8fafc;
  classDef chain fill:#1f2937,stroke:#f97316,stroke-width:2px,color:#f8fafc;
  classDef insight fill:#1a2e05,stroke:#84cc16,stroke-width:2px,color:#f8fafc;

  Owner["Owner · Multisig / Hardware Wallet"]:::control --> CLI["CLI · src/index.js"]:::control
  CLI --> Orchestrator["Orchestrator Core · src/orchestrator"]:::runtime
  Orchestrator --> Lifecycle["Job Lifecycle Engine · src/services/jobLifecycle.js"]:::runtime
  Orchestrator --> Governance["Governance Builders · src/services/governance.js"]:::control
  Orchestrator --> Telemetry["Prometheus Exporter · src/telemetry/monitoring.js"]:::insight
  Lifecycle --> Registry[("Job Registry Contracts")]:::chain
  Governance --> Chain[("Protocol Surface")]:::chain
  Telemetry --> Dashboards[["Grafana / KPI Boards"]]:::insight
  Lifecycle --> Metrics[["α‑WU Metrics Cache"]]:::insight
```

### Highlights

* **CLI Spine:** [`src/index.js`](src/index.js) dispatches commands for jobs, treasury, validators, and ENS guardianship.
* **Services:** Job logic under [`src/services`](src/services) handles lifecycle, treasury, and governance mutations.
* **Telemetry:** [`src/telemetry`](src/telemetry) exports Prometheus gauges and KPI caches aligned with on-chain events.
* **Subgraph + Scripts:** [`subgraph/`](subgraph) mirrors the same event schema for indexers or downstream analytics.

---

## Smart Contracts

Contracts preserve validator weighting, slashing controls, and KPI event emission. Each surface is paired with interfaces used by the runtime and subgraph.

| Contract / Spec | Purpose | Location |
| --- | --- | --- |
| `AlphaNodeManager` | Ownable control plane that gates validators, ENS identities, staking, and emits KPI events | [`contracts/AlphaNodeManager.sol`](contracts/AlphaNodeManager.sol) |
| `IAlphaWorkUnitEvents` | Solidity interface defining `AlphaWUMinted`, `AlphaWUValidated`, `AlphaWUAccepted`, `SlashApplied` | [`contracts/interfaces/IAlphaWorkUnitEvents.sol`](contracts/interfaces/IAlphaWorkUnitEvents.sol) |
| KPI Interface Mirror | Shared ABI for external registries and scripts | [`docs/telemetry/AlphaWorkUnitEvents.sol`](docs/telemetry/AlphaWorkUnitEvents.sol) |
| Subgraph Schema | Canonical GraphQL surface for KPI feeds | [`docs/telemetry/subgraph.schema.graphql`](docs/telemetry/subgraph.schema.graphql) |

```mermaid
flowchart TD
  classDef contract fill:#1f2937,stroke:#f59e0b,stroke-width:2px,color:#f8fafc;
  classDef service fill:#0f172a,stroke:#22d3ee,stroke-width:2px,color:#e0f2fe;
  classDef control fill:#1e293b,stroke:#34d399,stroke-width:2px,color:#ecfdf5;

  Owner[[Owner Signer]]:::control --> Manager[(AlphaNodeManager)]:::contract
  Manager --> Events[[AlphaWorkUnitEvents]]:::contract
  Events --> LifecycleService["Lifecycle Service · src/services/jobLifecycle.js"]:::service
  Events --> RewardsService["Rewards Service · src/services/rewards.js"]:::service
```

*Every emitted event is consumed by [`src/services/alphaWorkUnits.js`](src/services/alphaWorkUnits.js) and mirrored in the subgraph mappings to keep CLI, dashboards, and scripts in sync.*

---

## Telemetry

α-WU telemetry is normalized per validator stake, streamed to Prometheus, and mirrored into dashboards for multi-window KPIs.

```mermaid
sequenceDiagram
  participant Agent as Agent
  participant Registry as JobRegistry
  participant Node as Alpha Node Runtime
  participant Telemetry as Prometheus Exporter
  participant Dashboard as KPI Dashboard

  Agent->>Registry: submitJob()
  Registry->>Node: AlphaWUMinted
  Registry->>Node: AlphaWUValidated
  Registry->>Node: AlphaWUAccepted
  Registry->>Node: SlashApplied
  Node->>Telemetry: KPIs (AR, VQS, OTC, SAY)
  Node->>Dashboard: 7d / 30d leaderboards
```

| KPI | Formula | Gauge | Windows |
| --- | --- | --- | --- |
| Acceptance Rate (AR) | `accepted ÷ minted` | `agi_alpha_node_alpha_wu_acceptance_rate` | 7d · 30d · all |
| Validator-Weighted Quality (VQS) | `median(score × normalized stake)` | `agi_alpha_node_alpha_wu_quality` | 7d · 30d · all |
| On-Time Completion (OTC) | `p95(accepted.ts − minted.ts)` | `agi_alpha_node_alpha_wu_on_time_p95_seconds` | 7d · 30d · all |
| Slashing-Adjusted Yield (SAY) | `(accepted − slashes) ÷ stake` | `agi_alpha_node_alpha_wu_slash_adjusted_yield` | 7d · 30d · all |

The telemetry exporter defined in [`src/telemetry/monitoring.js`](src/telemetry/monitoring.js) pulls data from the KPI cache [`src/telemetry/alphaMetrics.js`](src/telemetry/alphaMetrics.js), ensuring dashboards and CLI outputs share identical calculations.

---

## Dashboards

Grafana JSON blueprints in [`docs/telemetry`](docs/telemetry) provide instant visualization of KPI envelopes, validator health, and governance readiness.

```mermaid
flowchart LR
  classDef chain fill:#1f2937,stroke:#f59e0b,stroke-width:2px,color:#f8fafc;
  classDef runtime fill:#0f172a,stroke:#22d3ee,stroke-width:2px,color:#e0f2fe;
  classDef insight fill:#111827,stroke:#9333ea,stroke-width:2px,color:#fef9ff;
  classDef command fill:#1e293b,stroke:#34d399,stroke-width:2px,color:#ecfdf5;

  OnChain[(AGI Jobs Surface)]:::chain --> Events[[IAlphaWorkUnitEvents]]:::chain
  Events --> Indexer[[Subgraph Indexer · subgraph/]]:::runtime
  Events --> Streamer[[Realtime Stream · src/services/alphaWorkUnits.js]]:::runtime
  Indexer --> KPICache[[Rolling KPI Cache]]:::insight
  Streamer --> KPICache
  KPICache --> Prometheus[[Prometheus Exporter]]:::insight
  KPICache --> Dashboards[[Grafana JSON Blueprints]]:::insight
  KPICache --> CLI[[CLI `jobs alpha-kpi`]]:::command
  Prometheus --> Owner[[Owner Alerts]]:::command
  Dashboards --> Owner
  CLI --> Owner
```

* **Blueprints:** [`docs/telemetry/dashboard.json`](docs/telemetry/dashboard.json) and [`docs/telemetry/alpha-work-unit-dashboard.json`](docs/telemetry/alpha-work-unit-dashboard.json).
* **Control Hierarchy:** Dashboards are fed exclusively by the KPI cache, so CLI leaderboards, Prometheus gauges, and Grafana tiles always agree.

---

## Deployment

Deployment artifacts cover container images, Helm charts, and scripts for spinning new validator spines.

| Surface | Description |
| --- | --- |
| [`Dockerfile`](Dockerfile) | Production Node.js 20 image with telemetry exporters and CLI baked in. |
| [`deploy/helm/agi-alpha-node`](deploy/helm/agi-alpha-node) | Helm chart with ConfigMaps for CLI configs, Prometheus scraping, and ENS secrets. |
| [`scripts/`](scripts) | Helper scripts for RPC bootstrapping, KPI ingestion, and ENS health checks. |

### Control hierarchy

```mermaid
flowchart TD
  classDef ops fill:#0f172a,stroke:#06b6d4,stroke-width:2px,color:#f8fafc;
  classDef env fill:#1f2937,stroke:#f59e0b,stroke-width:2px,color:#f8fafc;
  classDef control fill:#111827,stroke:#4c1d95,stroke-width:2px,color:#f8fafc;

  Repo[[Repo · main]]:::control --> Docker[(Docker Image)]:::ops
  Docker --> Helm[(Helm Chart)]:::ops
  Helm --> Cluster[(Kubernetes / Validator Fleet)]:::env
  Cluster --> Observability[[Prometheus / Grafana]]:::env
  Cluster --> OwnerConsole[[Owner Console / CLI]]:::control
```

*Helm values map directly to environment variables consumed by [`src/config`](src/config), allowing deterministic promotions across fleets.*

---

## Continuous Integration

Quality gates live in [`./.github/workflows/ci.yml`](.github/workflows/ci.yml) and enforce formatting, lint, test, coverage, Solidity, TypeScript, and Docker validation jobs in a single workflow.

| Job | Purpose |
| --- | --- |
| `lint` | Markdown linting, link checks, branch policy enforcement. |
| `test` | Unit and integration tests for the Node runtime. |
| `solidity` | Lint and compile contracts. |
| `typescript` | Build the subgraph TypeScript bundle. |
| `coverage` | Generate and upload coverage artefacts. |
| `docker-smoke` | Build the container image and run CLI smoke tests. |

**Badges** for build and coverage are pinned above, both sourced from the same workflow.

---

## Governance

Governance primitives keep ownership programmable but uncompromising.

* **ENS & Identity:** [`src/services/ensGuide.js`](src/services/ensGuide.js) and [`src/services/ensVerifier.js`](src/services/ensVerifier.js) enforce ENS resolution for `alpha.node.agi.eth` before orchestrator tasks unlock.
* **Rewards & Treasury Controls:** [`src/services/rewards.js`](src/services/rewards.js) binds payouts to multisig approvals enforced on-chain via `AlphaNodeManager`.
* **Emergency Pauses:** [`src/services/governance.js`](src/services/governance.js) exposes pause/resume hooks wired to registry contracts.
* **Validator Council:** Stake-weighted KPIs determine validator reputation, directly influencing governance proposals.

---

## Quickstart

1. **Install dependencies**

   ```bash
   npm install
   ```

2. **Configure environment**

   ```bash
   cp deploy/docker/node.env.example .env
   # set RPC, registry, telemetry, and ENS values
   ```

3. **Run tests and lint**

   ```bash
   npm run lint && npm test
   ```

4. **Stream KPIs from a registry**

   ```bash
   node src/index.js jobs alpha-kpi \
     --registry 0xRegistry \
     --rpc https://rpc.example \
     --windows 7d,30d \
     --events data/alpha-events.json
   ```

5. **Build and run the container**

   ```bash
   docker build -t agi-alpha-node .
   docker run --env-file .env agi-alpha-node
   ```

Every command surfaces deterministic output, reinforcing the iconic control hierarchy expected from an AGI Alpha Node operator.

---

*License: [MIT](LICENSE)*
