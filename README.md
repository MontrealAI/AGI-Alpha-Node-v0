# AGI Alpha Node v0 · Cognitive Yield Engine ⚡

<!-- markdownlint-disable MD013 MD033 -->
<p align="center">
  <picture>
    <source srcset="1.alpha.node.agi.eth.svg" type="image/svg+xml" />
    <img src="1.alpha.node.agi.eth.png" alt="AGI Alpha Node Insignia" width="256" loading="lazy" decoding="async" />
  </picture>
</p>

<p align="center">
  <a href="https://github.com/MontrealAI/AGI-Alpha-Node-v0/actions/workflows/ci.yml?query=branch%3Amain">
    <img src="https://img.shields.io/github/actions/workflow/status/MontrealAI/AGI-Alpha-Node-v0/ci.yml?branch=main&label=CI%20%2B%20Gates&logo=githubactions&logoColor=white" alt="CI status" />
  </a>
  <a href=".github/required-checks.json">
    <img src="https://img.shields.io/badge/PR%20Gates-Required%20on%20Main-8b5cf6?logo=github" alt="Required PR checks" />
  </a>
  <a href="docs/testing.md">
    <img src="https://img.shields.io/badge/Quality-Tests%20%2B%20Coverage%20%2B%20Policies-14b8a6?logo=vitest&logoColor=white" alt="Quality gates" />
  </a>
  <img src="https://img.shields.io/badge/Runtime-Node.js%2020.18%2B-43853d?logo=node.js&logoColor=white" alt="Runtime" />
  <img src="https://img.shields.io/badge/Solidity-0.8.26-363636?logo=solidity&logoColor=white" alt="Solidity" />
  <a href="https://etherscan.io/address/0xa61a3b3a130a9c20768eebf97e21515a6046a1fa"><img src="https://img.shields.io/badge/$AGIALPHA-0xa61a3b3a130a9c20768eebf97e21515a6046a1fa-ff3366?logo=ethereum&logoColor=white" alt="$AGIALPHA" /></a>
  <img src="https://img.shields.io/badge/Owner%20Controls-Total%20Command-9333ea?logo=gnometerminal&logoColor=white" alt="Owner controls" />
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-10b981?logo=open-source-initiative&logoColor=white" alt="MIT" /></a>
  <a href="Dockerfile"><img src="https://img.shields.io/badge/Docker-Ready-2496ed?logo=docker&logoColor=white" alt="Docker" /></a>
  <a href="deploy/helm/agi-alpha-node"><img src="https://img.shields.io/badge/Helm-Chart-0ea5e9?logo=helm&logoColor=white" alt="Helm" /></a>
  <a href="docs/testing.md"><img src="https://img.shields.io/badge/CI%20Playbook-Green%20by%20Design-06b6d4?logo=githubactions&logoColor=white" alt="Testing playbook" /></a>
  <a href="https://github.com/MontrealAI/AGI-Alpha-Node-v0/graphs/contributors"><img src="https://img.shields.io/github/contributors/MontrealAI/AGI-Alpha-Node-v0?label=Contributors&color=2563eb&logo=github" alt="Contributors" /></a>
  <img src="https://img.shields.io/badge/Data%20Spine-SQLite%20%2B%20Migrations-0f766e?logo=sqlite&logoColor=white" alt="Persistence" />
</p>

> **AGI Alpha Node v0** is the cognitive yield engine that turns heterogeneous agentic work into verifiable α‑Work Units (α‑WU), anchors them to the `$AGIALPHA` treasury (`0xa61a3b3a130a9c20768eebf97e21515a6046a1fa`, 18 decimals), and keeps every lever under the owner’s command—pause, re-weight, rotate validators, refresh baselines, and reroute rewards without redeploying code.

## Quickstart (production-safe defaults)

```bash
git clone https://github.com/MontrealAI/AGI-Alpha-Node-v0.git
cd AGI-Alpha-Node-v0
npm ci                    # installs native better-sqlite3, solc, vitest, etc.
npm run db:migrate        # initializes SQLite spine (use AGI_ALPHA_DB_PATH to override)
npm run db:seed           # loads canonical providers + task types
npm test                  # full vitest suite, policy gates, persistence coverage
npm start -- --help       # explore runtime flags
```

## Operational notes

- Owner-level directives live in `contracts/AlphaNodeManager.sol` and are callable without redeploys (pause/unpause, validator set rotation, staking/withdrawal, registry rewrites, reward redirects).
- CI is enforced on `main` via `.github/required-checks.json`; every PR surfaces lint, policy, coverage, Solidity, and subgraph gates before merge.
- Database CLI (`node src/persistence/cli.js <migrate|seed> [db]`) mirrors production automation so non-specialists can bootstrap nodes safely.

## Non-negotiable guarantees

- **Owner total command**: pause/unpause, swap validator sets, rewrite identity controllers, and redirect/stage rewards directly from `AlphaNodeManager` without migrating contracts.
- **Reproducible data spine**: migrations + seeds initialize providers, task types, runs, telemetry, alpha indices, and constituent weights with indexes on provider/day for instant dashboards.
- **Hardened delivery**: CI pins every gate (lint, links, policy/branch, JS/TS tests, Solidity checks, subgraph builds, audit scan, Docker smoke) and is enforced for PRs on `main`.

```mermaid
flowchart LR
  Owner((Owner)) -->|Directives| Governance[Governance Kernel]
  Governance -->|Pauses / Baselines / Validator Sets| ControlPlane[Control Plane]
  ControlPlane -->|Schedules| OrchestratorMesh[Orchestrator Mesh]
  OrchestratorMesh -->|Dispatch α‑work| IntelligenceSwarm[Intelligence Swarm]
  IntelligenceSwarm -->|Attested Proofs| LedgerTelemetry[Ledger + Telemetry Spine]
  LedgerTelemetry -->|αWU Metering| AlphaWB[Global α‑WU Benchmark]
  LedgerTelemetry -->|Rewards $AGIALPHA| Treasury[(0xa61a3b3a130a9c20768eebf97e21515a6046a1fa)]
  AlphaWB -->|αWB_t & Sector Slices| Dashboards[[Operator Dashboards]]
```

```mermaid
flowchart TD
  subgraph Ledger[Data & Telemetry Spine]
    A[Providers] --> B[Task Runs]
    B --> C[Quality Evaluations]
    B --> D[Energy Reports]
    B --> E[Synthetic Labor Scores]
    F[Index Values] --> G[Index Constituent Weights]
    A --> G
  end

  subgraph Contracts[On-chain Control]
    H[AlphaNodeManager]
    I[$AGIALPHA Token]
  end

  Owner[[Owner Multisig]] -->|Pause / Reweight / Update metadata| H
  H -->|Reward signals| I
  Ledger -->|Index snapshots| H
```

## Why this node

- **Owner-first control**: every critical switch is held by the contract owner—pause/unpause, validator rotation, identity lifecycle, staking withdrawals, and slashing routines are callable without redeployment from `contracts/AlphaNodeManager.sol`.
- **Deterministic data spine**: the node persists providers, task types, runs, telemetry, and α-index values through SQLite with migrations and seeds so that dashboards, subgraphs, and settlement always agree.
- **Enterprise-grade gates**: CI enforces lint, tests, coverage, Solidity checks, TypeScript/subgraph builds, policy gates, security audit scan, and branch guards on every PR before merge.
- **Operator clarity**: the README, CLI, and docs are wired for non-specialists—commands mirror production automation (`npm run ci:verify`, `node src/persistence/cli.js migrate`, etc.).

## System topology

```mermaid
sequenceDiagram
  participant Owner
  participant Governance
  participant ControlPlane
  participant Orchestrator
  participant Providers
  participant Ledger
  participant Treasury

  Owner->>Governance: Set policy / validator set / pause state
  Governance->>ControlPlane: Issue work baselines & guardrails
  ControlPlane->>Orchestrator: Dispatch α‑WU batches
  Orchestrator->>Providers: Execute task types (benchmarks, research, refactors)
  Providers-->>Ledger: Telemetry, energy mix, quality evals, synthetic labor scores
  Ledger-->>Governance: Alpha index values + constituent weights
  Ledger-->>Treasury: Reward flows in $AGIALPHA
  Owner->>Treasury: Oversight (withdrawals / redirects)
```

## Repository map

- **Runtime**: `src/index.js` boots telemetry, health gates, orchestrator loops, and service wiring.
- **Contracts**: `contracts/AlphaNodeManager.sol` (owner-led control plane, staking, validator registry) with canonical `$AGIALPHA` token address baked in.
- **Persistence**: `src/persistence` contains SQLite migrations, seeders, repositories, and CLI entrypoints for repeatable data operations.
- **Docs**: `docs/` holds identity, economics, manifesto, and ops guidance.
- **Tests**: `test/` runs Vitest suites (JS + TS) covering governance, attestation, persistence, ENS, staking, and orchestrator behavior.
- **Subgraph**: `subgraph/` contains Graph Node manifest generation and TypeScript bindings for on-chain indexing.

## Core data model

The storage layer encodes the AGI Alpha Index across providers and work units. All tables are created by `src/persistence/migrations/0001_core.sql` and wrapped by repositories in `src/persistence/repositories.js`.

```mermaid
erDiagram
  providers ||--o{ task_runs : executes
  task_types ||--o{ task_runs : templates
  task_runs ||--o{ quality_evaluations : scored_by
  task_runs ||--o{ energy_reports : energy_signature
  providers ||--o{ synthetic_labor_scores : uplifted_by
  index_values ||--o{ index_constituent_weights : weights
  providers ||--o{ index_constituent_weights : contributes

  providers {
    integer id PK
    text name
    text region
    text sector_tags
    text energy_mix
    text metadata
  }
  task_types {
    integer id PK
    text name
    real difficulty_coefficient
  }
  task_runs {
    integer id PK
    integer provider_id FK
    integer task_type_id FK
    text status
    real raw_throughput
    integer tokens_processed
    integer tool_calls
    real novelty_score
    real quality_score
    text started_at
    text completed_at
  }
  quality_evaluations {
    integer id PK
    integer task_run_id FK
    text evaluator
    real score
    text notes
  }
  energy_reports {
    integer id PK
    integer task_run_id FK
    real kwh
    text energy_mix
    real carbon_intensity_gco2_kwh
    real cost_usd
    text region
  }
  synthetic_labor_scores {
    integer id PK
    integer provider_id FK
    integer task_run_id FK
    real score
    text rationale
  }
  index_values {
    integer id PK
    text effective_date
    real headline_value
    real energy_adjustment
    real quality_adjustment
    real consensus_factor
  }
  index_constituent_weights {
    integer id PK
    integer index_value_id FK
    integer provider_id FK
    real weight
  }
```

| Entity | Purpose | Key fields |
| --- | --- | --- |
| `providers` | Registered execution nodes with region, sector tags, energy mix, metadata | `name`, `operator_address`, `region`, `sector_tags[]`, `energy_mix`, `metadata` |
| `task_types` | Canonical α‑WU templates with difficulty coefficients | `name`, `description`, `difficulty_coefficient` |
| `task_runs` | Individual executions tied to providers & task types | `provider_id`, `task_type_id`, `status`, `raw_throughput`, `tokens_processed`, `tool_calls`, `novelty_score`, `quality_score`, timestamps |
| `quality_evaluations` | Evaluator-scored runs | `task_run_id`, `evaluator`, `score`, `notes` |
| `energy_reports` | Energy/region signals per run | `task_run_id`, `kwh`, `energy_mix`, `carbon_intensity_gco2_kwh`, `cost_usd`, `region` |
| `synthetic_labor_scores` | Synthetic labor uplift per provider/run | `provider_id`, `task_run_id`, `score`, `rationale` |
| `index_values` | Headline Alpha Index values | `effective_date`, `headline_value`, `energy_adjustment`, `quality_adjustment`, `consensus_factor` |
| `index_constituent_weights` | Provider weights for each index value | `index_value_id`, `provider_id`, `weight` |

### Migrations & seeds

- **Apply migrations**

  ```bash
  npm run db:migrate            # uses AGI_ALPHA_DB_PATH or in-memory by default
  node src/persistence/cli.js migrate data/alpha.sqlite
  ```

- **Seed catalog**

  ```bash
  npm run db:seed               # same DB resolution rules
  node src/persistence/cli.js seed data/alpha.sqlite
  ```

  Seeds cover task types (code-refactor, research-dossier, data-cleanse, agent-benchmark) and sample providers (hydro + wind mixes) from `src/persistence/seeds.js`.

- **Repositories**: CRUD helpers for each entity enforce JSON/tags serialization, timestamp updates, and provider/task lookups.

### Repository usage example

```js
import { initializeDatabase } from '../src/persistence/database.js';
import {
  ProviderRepository,
  TaskTypeRepository,
  TaskRunRepository,
  QualityEvaluationRepository,
  EnergyReportRepository
} from '../src/persistence/repositories.js';
import { seedAll } from '../src/persistence/seeds.js';

const db = initializeDatabase({ filename: 'data/alpha.sqlite', withSeed: true });
const providers = new ProviderRepository(db);
const taskTypes = new TaskTypeRepository(db);
const runs = new TaskRunRepository(db);
const quality = new QualityEvaluationRepository(db);
const energy = new EnergyReportRepository(db);

const provider = providers.findByName('helios-labs');
const taskType = taskTypes.findByName('code-refactor');

const run = runs.create({
  provider_id: provider.id,
  task_type_id: taskType.id,
  external_id: 'alpha-run-001',
  status: 'running',
  raw_throughput: 1.2,
  tokens_processed: 12000
});

quality.create({ task_run_id: run.id, evaluator: 'cognitive-audit', score: 0.93 });
energy.create({ task_run_id: run.id, kwh: 4.2, energy_mix: 'hydro', region: 'na-east' });

console.log(runs.getById(run.id));
```

### CI & release discipline

```mermaid
flowchart LR
  Lint[Markdown + Links] --> Tests[Vitest JS/TS]
  Tests --> Coverage[Coverage + Upload]
  Coverage --> Solidity[Solhint + solc smoke]
  Solidity --> Subgraph[Subgraph build]
  Subgraph --> Security[High-severity npm audit]
  Security --> Policy[Health + Branch gates]
  Policy --> Docker[Docker build + runtime help]
  Docker --> Merge[PR Merge Allowed]
```

- `npm run ci:verify` replicates the GitHub Actions pipeline locally.
- Required checks for PRs and `main` are tracked in `.github/required-checks.json` and rendered in the badges above.
- Coverage artifacts and subgraph codegen are uploaded on every CI run to keep downstream analytics aligned.
