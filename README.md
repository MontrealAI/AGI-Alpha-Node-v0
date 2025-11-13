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
    <img src="https://github.com/MontrealAI/AGI-Alpha-Node-v0/actions/workflows/ci.yml/badge.svg?branch=main" alt="Continuous Integration" />
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

> The control plane that shapes global alpha: deterministic work units, ruthless telemetry, and total operator sovereignty in a single deployable lattice.

---

## Contents

1. [Mission & Highlights](#mission--highlights)
2. [Repository Topography](#repository-topography)
3. [Runtime Lattice](#runtime-lattice)
4. [α-WU Economics](#α-wu-economics)
5. [Smart Contract Sovereignty](#smart-contract-sovereignty)
6. [Telemetry & Insight Mesh](#telemetry--insight-mesh)
7. [Deployment & Operations](#deployment--operations)
8. [Governance & Owner Controls](#governance--owner-controls)
9. [Continuous Integration](#continuous-integration)
10. [Quickstart](#quickstart)
11. [Testing & Quality Gates](#testing--quality-gates)
12. [Further Reading](#further-reading)

---

## Mission & Highlights

AGI Alpha Node v0 is the command spine for validator-weighted α-work units. It couples blockchain truth with high-intensity compute routing so that a single owner can steer a fleet of agents, enclaves, and validators in real time.

* **Unified Metering:** [`src/constants/workUnits.js`](src/constants/workUnits.js) defines α-WU from first principles and powers every on-chain reward, KPI, and treasury shift.
* **Owner Supremacy:** [`contracts/AlphaNodeManager.sol`](contracts/AlphaNodeManager.sol) provides fine-grained ownership controls—pause, resume, reassign validators, rotate ENS identities, and redirect stakes instantly.
* **Observability First:** Prometheus exporters, Grafana blueprints, and streaming KPIs render every alpha pulse visible.
* **Battle-tested Delivery:** Container images, Helm charts, and CI enforcement ensure non-technical operators can deploy and audit the node safely.

---

## Repository Topography

| Surface | Description |
| --- | --- |
| [`src/`](src) | Node.js runtime, orchestration services, telemetry exporters, and config schema. |
| [`contracts/`](contracts) | Solidity control plane for validators, staking, and work unit events. |
| [`docs/`](docs) | Economics papers, telemetry references, and the new [`α-WU framework`](docs/alpha-wu.md). |
| [`deploy/`](deploy) | Helm chart, Kubernetes manifests, and operational bootstrapping. |
| [`scripts/`](scripts) | Automation for CI gates, subgraph rendering, and governance verification. |
| [`subgraph/`](subgraph) | Graph Protocol mappings aligned with on-chain KPI events. |

```mermaid
flowchart LR
  classDef compute fill:#0f172a,stroke:#22d3ee,stroke-width:2px,color:#e0f2fe;
  classDef chain fill:#111827,stroke:#f97316,stroke-width:2px,color:#f8fafc;
  classDef ops fill:#1e1b4b,stroke:#a855f7,stroke-width:2px,color:#ede9fe;
  classDef insight fill:#0f172a,stroke:#84cc16,stroke-width:2px,color:#ecfccb;

  Runtime[[src/ · Runtime Spine]]:::compute --> Contracts[(contracts/ · Sovereign Ledger)]:::chain
  Runtime --> Telemetry[[docs/telemetry · Insight Atlases]]:::insight
  Runtime --> Deploy[(deploy/ · Ops Blueprints)]:::ops
  Contracts --> Subgraph[[subgraph/ · Indexer Surface]]:::insight
  Deploy --> Scripts[[scripts/ · Automation]]:::ops
```

---

## Runtime Lattice

The runtime weaves CLI commands, orchestration daemons, and streaming telemetry into a coherent sovereignty mesh.

```mermaid
flowchart TD
  classDef control fill:#0f172a,stroke:#06b6d4,stroke-width:2px,color:#e0f2fe;
  classDef service fill:#111827,stroke:#f59e0b,stroke-width:2px,color:#f8fafc;
  classDef ledger fill:#1f2937,stroke:#84cc16,stroke-width:2px,color:#ecfccb;
  classDef insight fill:#1e1b4b,stroke:#a855f7,stroke-width:2px,color:#ede9fe;

  Owner[Owner Console]:::control --> CLI[CLI Spine · src/index.js]:::control
  CLI --> Orchestrator[Job Orchestrator · src/orchestrator/]:::service
  Orchestrator --> Lifecycle[Lifecycle Engine · src/services/jobLifecycle.js]:::service
  Orchestrator --> Governance[Governance Builders · src/services/governance.js]:::service
  Lifecycle --> Registry[(Job Registry Contracts)]:::ledger
  Governance --> Chain[(Protocol Contracts)]:::ledger
  Lifecycle --> Metrics[[Alpha KPI Cache · src/telemetry/alphaMetrics.js]]:::insight
  Metrics --> Prometheus[[Prometheus Exporter · src/telemetry/monitoring.js]]:::insight
  Metrics --> Dashboards[[Grafana Atlases · docs/telemetry]]:::insight
```

*Commands fire from [`src/index.js`](src/index.js) and traverse the orchestrator, ensuring deterministic application of policy, treasury directives, and ENS guardianship.*

---

## α-WU Economics

α-work units are the canonical ledger for all compute accomplished by the node. They combine GPU minutes, workload classification, VRAM tier, SLA profile, and benchmark multipliers into a single metric.

* **Base Unit:** `ALPHA_WU = 1` within [`src/constants/workUnits.js`](src/constants/workUnits.js).
* **Configurable Weights:** The `WORK_UNITS` block in [`src/config/schema.js`](src/config/schema.js) accepts JSON overrides to adjust model class, VRAM, SLA, and benchmark weights—invalid or negative entries are rejected.
* **Documentation:** Refer to the dedicated [α-WU framework](docs/alpha-wu.md) for canonical tables and worked examples (including 20-minute 80 GB, 70B low-latency enclave jobs).
* **Ledger Impact:** KPI dashboards, staking rewards, and treasury routing all derive from these weights; adjust them to express bespoke economics without touching code.

Example override:

```bash
export WORK_UNITS='{"baseUnit":1.5,"epochDurationSeconds":1800,"weights":{"modelClass":{"LLM_70B":5.0}}}'
```

---

## Smart Contract Sovereignty

The Solidity surface is tailored for absolute owner control while honoring canonical $AGIALPHA staking.

| Contract | Role | Owner Controls |
| --- | --- | --- |
| [`AlphaNodeManager.sol`](contracts/AlphaNodeManager.sol) | Ownable orchestrator for validators, staking, and α-WU event emission. | Pause / unpause, assign validators, register ENS identities, rotate controllers, set identity status, revoke identities, and manage stake flows. |
| [`IAlphaWorkUnitEvents.sol`](contracts/interfaces/IAlphaWorkUnitEvents.sol) | Shared ABI for runtime, subgraph, and off-chain analytics. | Emits `AlphaWUMinted`, `AlphaWUValidated`, `AlphaWUAccepted`, and `SlashApplied`. |

*The canonical $AGIALPHA token (18 decimals) is fixed at [`0xa61a3b3a130a9c20768eebf97e21515a6046a1fa`](https://etherscan.io/address/0xa61a3b3a130a9c20768eebf97e21515a6046a1fa); schema validation enforces this checksum for every deployment.*

---

## Telemetry & Insight Mesh

Prometheus gauges, Grafana atlases, and CLI KPIs share the same α-WU cache so that every vantage point remains synchronized.

```mermaid
sequenceDiagram
  participant Agent as Agent Swarm
  participant Registry as Job Registry
  participant Runtime as Alpha Node Runtime
  participant Telemetry as Prometheus Exporter
  participant Dash as Grafana Atlases

  Agent->>Registry: submitJob()
  Registry-->>Runtime: AlphaWUMinted / Validated / Accepted / SlashApplied
  Runtime->>Telemetry: α-WU Gauges & Counters
  Runtime->>Dash: Leaderboards + Epoch Feeds
  Telemetry->>Owner: Alerts / Webhooks
```

* Gauges live in [`src/telemetry/monitoring.js`](src/telemetry/monitoring.js).
* Grafana JSON atlases reside in [`docs/telemetry`](docs/telemetry).
* KPI calculations reuse [`src/telemetry/alphaMetrics.js`](src/telemetry/alphaMetrics.js) for deterministic reporting across CLI, Prometheus, and dashboards.

---

## Deployment & Operations

| Surface | Highlights |
| --- | --- |
| [`Dockerfile`](Dockerfile) | Node.js 20 production image with CLI, telemetry exporters, and healthchecks baked in. |
| [`deploy/helm/agi-alpha-node`](deploy/helm/agi-alpha-node) | Helm chart orchestrating ConfigMaps, Prometheus scraping, ENS secrets, and rollout policies. |
| [`scripts/`](scripts) | Tooling for verifying health gates, rendering subgraph manifests, and simulating KPI flows. |

Operational recommendations:

1. Build or pull the Docker image and supply environment overrides via Kubernetes secrets or `.env` files.
2. Apply the Helm chart with enforced `WORK_UNITS` overrides if the economics differ from the canonical tables.
3. Wire Prometheus to scrape the exporter endpoint (`METRICS_PORT`, default `9464`).
4. Forward Grafana dashboards using the JSON atlases for immediate visualization.

---

## Governance & Owner Controls

The owner address wields complete authority over runtime parameters and can adjust business levers without redeploying contracts. Every directive is designed for immediate execution so that treasury posture, validator availability, and α-WU policy can be tuned in seconds.

| Owner Directive | Smart-Contract Surface | Runtime / CLI Entry Point | Operational Impact |
| --- | --- | --- | --- |
| Pause / resume | `SystemPause.pauseAll()` / `SystemPause.resumeAll()` via [`buildSystemPauseTx`](src/services/governance.js) | `node src/index.js governance system-pause --system-pause <addr> --action pause|resume` | Instantly halts or resumes validator flow, freezing α-WU mint/validate events until resumed. |
| Validator registry | `WorkMeter.setValidator(address,bool)` via [`buildWorkMeterValidatorTx`](src/services/governance.js) | `node src/index.js governance workmeter-validator --work-meter <addr> --validator <addr> --allowed true|false` | Curate which operators can validate segments; rejected addresses are blocked at contract level. |
| Identity mesh | `IdentityRegistry.setAdditionalNodeOperator(address,bool)` via [`buildIdentityDelegateTx`](src/services/governance.js) | `node src/index.js governance identity-delegate --identity-registry <addr> --operator <addr> --allowed true|false` | Assign ENS guardianship, rotate controllers, toggle activation for enclaves and research agents. |
| Stake custody | `PlatformIncentives.stakeAndActivate()` / `StakeManager.setMinimumStake()` via [`buildStakeAndActivateTx`](src/services/governance.js) & [`buildMinimumStakeTx`](src/services/governance.js) | `node src/index.js stake-tx --amount <amt> --incentives <addr>` / `governance minimum-stake --stake-manager <addr> --amount <amt>` | Move $AGIALPHA into or out of custody, enforce minimum posture, and redirect rewards. |
| α-WU policy | [`WORK_UNITS` config](src/config/schema.js) | `WORK_UNITS=... npm run ci:verify` | Reweight economics, epoch cadence, and benchmark multipliers with schema validation preventing malformed entries. |

```mermaid
stateDiagram-v2
  classDef owner fill:#0f172a,stroke:#38bdf8,color:#e0f2fe;
  classDef ledger fill:#111827,stroke:#f97316,color:#f8fafc;

  [*] --> Operational
  Operational --> Paused: owner.pause()
  Paused --> Operational: owner.unpause()
  Operational --> ValidatorRotated: owner.setValidator()
  ValidatorRotated --> Operational
  Operational --> IdentityShifted: owner.updateIdentityController()
  IdentityShifted --> Operational
  Operational --> TreasuryRebalanced: owner.withdrawStake()/stake()
  TreasuryRebalanced --> Operational

  note right of Operational
    α-WU mint/validate/accept flows,
    reward routing, and telemetry
    run at full velocity.
  end note

  note right of Paused
    Runtime enters safe mode,
    validators blocked, telemetry
    announces suspension.
  end note
```

Further playbooks live in the [operator runbook](docs/operator-runbook.md), covering deterministic recovery sequences, ENS hygiene, and safe rollout choreography. Direct owner invocations of [`AlphaNodeManager`](contracts/AlphaNodeManager.sol) functions (e.g., `pause`, `unpause`, `setValidator`, `recordAlphaWUMint`) remain available for hardware wallets and custodial scripts when low-level control is required.

---

## Continuous Integration

All pull requests and the `main` branch are protected by a comprehensive CI suite defined in [`.github/workflows/ci.yml`](.github/workflows/ci.yml). Required checks (codified in [`.github/required-checks.json`](.github/required-checks.json)) enforce:

1. **Linting:** Markdown + link lint, Solidity lint, TypeScript/JS generation gates.
2. **Testing:** Vitest unit suite, Solidity compilation, subgraph build validation.
3. **Security & Policy:** `npm audit`, health gate verification, and branch policy checks.
4. **Coverage:** Automated coverage reporting via CI badge above.

A green badge on this README reflects the current status of all required checks. The workflow blocks merges unless every gate is satisfied.

---

## Quickstart

```bash
npm install
npm run start -- --help                 # Explore CLI commands
npm run lint                            # Markdown + link linting
npm run test                            # Vitest suite
npm run ci:verify                       # Full CI pipeline locally
```

To supply configuration overrides, create a `.env` file or export variables:

```bash
export RPC_URL="https://rpc.ankr.com/eth"
export OPERATOR_ADDRESS="0x..."
export WORK_UNITS='{"weights":{"slaProfile":{"LOW_LATENCY_ENCLAVE":2.5}}}'
node src/index.js jobs list
```

---

## Testing & Quality Gates

| Command | Purpose |
| --- | --- |
| `npm run lint` | Markdown linting + link verification across docs and README. |
| `npm run test` | Executes the Vitest suite, including configuration schema validation. |
| `npm run coverage` | Generates coverage reports (text, lcov, JSON). |
| `npm run ci:verify` | Mirrors the GitHub Actions workflow locally for pre-flight validation. |
| `npm run ci:solidity` | Runs Solidity lint and compilation gates. |
| `npm run ci:ts` | Builds and validates the subgraph manifest. |

---

## Further Reading

* [$AGIALPHA Token Constants](src/constants/token.js)
* [α-WU Canonical Framework](docs/alpha-wu.md)
* [Telemetry Atlases](docs/telemetry)
* [Economics Treatise](docs/economics.md)
* [Manifesto](docs/manifesto.md)

---

### License

Released under the [MIT License](LICENSE).
