# AGI Alpha Node v0 · Cognitive Yield Engine ⚡️

<!-- markdownlint-disable MD012 MD013 MD033 -->
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
  <a href="https://github.com/MontrealAI/AGI-Alpha-Node-v0/actions?query=branch%3Amain">
    <img src="https://img.shields.io/badge/Checks-Visible%20in%20GitHub-0ea5e9?logo=github" alt="Checks visibility" />
  </a>
  <img src="https://img.shields.io/badge/Telemetry%20Schemas-v0-16a34a?logo=json&logoColor=white" alt="Telemetry schema version" />
  <img src="https://img.shields.io/badge/Observability-c8%20%7C%20vitest%20%7C%20OTel-0ea5e9?logo=testinglibrary&logoColor=white" alt="Coverage" />
  <a href="https://etherscan.io/address/0xa61a3b3a130a9c20768eebf97e21515a6046a1fa">
    <img src="https://img.shields.io/badge/$AGIALPHA-0xa61a...a1fa-ff3366?logo=ethereum&logoColor=white" alt="$AGIALPHA" />
  </a>
  <img src="https://img.shields.io/badge/Token%20Decimals-18%20dp-f97316?logo=ethereum&logoColor=white" alt="Token decimals" />
  <img src="https://img.shields.io/badge/Runtime-Node.js%2020.18%2B-43853d?logo=node.js&logoColor=white" alt="Runtime" />
  <img src="https://img.shields.io/badge/Solidity-0.8.26-363636?logo=solidity&logoColor=white" alt="Solidity" />
  <a href="Dockerfile">
    <img src="https://img.shields.io/badge/Docker-Ready-2496ed?logo=docker&logoColor=white" alt="Docker" />
  </a>
  <a href="deploy/helm/agi-alpha-node">
    <img src="https://img.shields.io/badge/Helm-Chart-0ea5e9?logo=helm&logoColor=white" alt="Helm" />
  </a>
  <img src="https://img.shields.io/badge/Data%20Spine-SQLite%20%2B%20Migrations-0f766e?logo=sqlite&logoColor=white" alt="Persistence" />
  <img src="https://img.shields.io/badge/Owner%20Controls-Total%20Command-9333ea?logo=gnometerminal&logoColor=white" alt="Owner controls" />
</p>

> **AGI Alpha Node v0** metabolizes heterogeneous agentic labor into verifiable α‑Work Units (α‑WU) and Synthetic Labor Units (SLU), prices the yield against energy, quality, and consensus, and routes the `$AGIALPHA` treasury (token: `0xa61a3b3a130a9c20768eebf97e21515a6046a1fa`, 18 decimals) under complete owner command. Everything can be paused, rerouted, or retuned without redeploying.

## Table of contents

- [Why this node](#why-this-node)
- [System architecture](#system-architecture)
- [Quickstart (non-technical friendly)](#quickstart-non-technical-friendly)
- [Telemetry ingestion v0](#telemetry-ingestion-v0)
- [Synthetic labor scoring engine (SLU)](#synthetic-labor-scoring-engine-slu)
- [Provider authentication & deduplication](#provider-authentication--deduplication)
- [Owner controls & on-chain levers](#owner-controls--on-chain-levers)
- [Data spine & migrations](#data-spine--migrations)
- [CI, gates, and release discipline](#ci-gates-and-release-discipline)
- [Operations playbook](#operations-playbook)
- [Repository atlas](#repository-atlas)
- [Appendix: Specs & references](#appendix-specs--references)

## Why this node

- **Owner-first sovereignty**: The owner steers every critical parameter—pauses, validator rotation, identity lifecycle, staking thresholds, emission multipliers, treasury routing, and governance ledgers—without altering deployed code. Command surfaces live in `contracts/AlphaNodeManager.sol` with orchestration helpers in `src/services/governance.js`.
- **Telemetry-ingestion hardened**: JSON Schema–verified payloads, hashed API keys, provider-aware rate-limit stubs, and idempotent task-run recording keep signals pristine while rejecting duplicates or malformed submissions.
- **Deterministic data spine**: SQLite migrations seed providers, task types, runs, telemetry, SLU snapshots, α‑index values, and constituent weights with indexes on provider/day for immediate dashboards and subgraph alignment.
- **Production-safe defaults**: The CLI, seeds, CI gates, Helm chart, and Docker build mirror automation paths so a non-specialist can bootstrap a production-critical node with a handful of commands.
- **Continuous alpha extraction**: Agentic swarms route jobs through provider meshes, generating synthetic labor, quality, and energy telemetry that continuously tune the `$AGIALPHA` flywheel.

## System architecture

```mermaid
flowchart LR
  Owner((Owner / Multisig)) -->|Directives| Governance[Governance Kernel]
  Governance -->|Pauses / Weights / Validator Sets| ControlPlane[Control Plane]
  ControlPlane -->|Schedules| OrchestratorMesh[Orchestrator Mesh]
  OrchestratorMesh -->|Dispatch α‑work| IntelligenceSwarm[Intelligence Swarm]
  IntelligenceSwarm -->|Attested Proofs| LedgerTelemetry[Ledger + Telemetry Spine]
  LedgerTelemetry -->|αWU + SLU Metering| AlphaWB[Global α‑WU Benchmark]
  LedgerTelemetry -->|Rewards $AGIALPHA| Treasury[(0xa61a3b3a130a9c20768eebf97e21515a6046a1fa)]
  AlphaWB -->|αWB_t & Sector Slices| Dashboards[[Operator Dashboards]]
```

```mermaid
graph TD
  subgraph Ingestion[Telemetry Ingestion v0]
    APIKeys[X-API-Key (hashed)] --> Gate[Provider Resolver]
    Gate --> Validator[JSON Schema v0]
    Validator -->|TaskRunTelemetry| TaskRuns[(task_runs)]
    Validator -->|EnergyReportPayload| Energy[(energy_reports)]
    Validator -->|QualityEvalPayload| Quality[(quality_evaluations)]
    Validator -->|ValidatorConsensus| VC[(synthetic_labor_scores.metadata)]
    TaskRuns --> Dedup[Idempotency Guard]
  end

  subgraph Control[Owner Control Plane]
    pause[Pause / Unpause]
    rotate[Rotate Validators]
    stakeOps[Stake Withdrawals]
    identityOps[ENS Identity Lifecycle]
    weights[Index Weights]
  end

  subgraph Data[Telemetry & Data Spine]
    providers[(providers)]
    tasks[(task_types)]
    runs[(task_runs)]
    quality[(quality_evaluations)]
    energy[(energy_reports)]
    synth[(synthetic_labor_scores)]
    idx[(index_values)]
  end

  Owner[[Owner Multisig]] --> Control
  Control -->|Commands| Ingestion
  Ingestion -->|Verified signals| Data
  Data -->|αWB snapshots| Control
  Control -->|Treasury Signals| Token[$AGIALPHA 0xa61a...a1fa]
```

## Quickstart (non-technical friendly)

1. **Install runtime**: Node.js 20.18+ and npm 10+. Run `npm ci` in the repo root for deterministic dependencies.
2. **Bootstrap the data spine**: `npm run db:migrate && npm run db:seed` to hydrate providers, task archetypes, and telemetry exemplars.
3. **Boot the node locally**: `npm start` launches the API + orchestration server with seeded providers and task types.
4. **Dry-run telemetry**: `npm run demo:local` fires the local cluster simulator; observe persisted records in the SQLite spine.
5. **Score a day of labor**: `node src/index.js score:daily --date 2024-05-01` prints per-provider SLU with difficulty, energy, quality, and validator consensus adjustments.
6. **Operate via CLI**: `node src/index.js --help` lists governance, staking, lifecycle, telemetry, scoring, and antifragility commands; each subcommand validates inputs and prints tabular outputs for easy auditing.
7. **Container + Helm**: `docker build -t agi-alpha-node:local .` for a portable image, or use `deploy/helm/agi-alpha-node` to drop into Kubernetes with the same health and telemetry probes.

## Telemetry ingestion v0

- **Schemas**: Task runs (`spec/task_run_telemetry.schema.json`), energy reports (`spec/energy_report.schema.json`), quality evaluations (`spec/quality_eval.schema.json`), and validator consensus telemetry (`spec/validator_consensus.schema.json`) are enforced via AJV before persistence.
- **Versioning & provenance**: Every stored record carries `schema_version`, metadata (notes, task label, request fingerprint), and a payload hash for auditability.
- **Rate-limit stub**: Per-provider windows are tracked and surfaced via `X-RateLimit-*` headers to prepare for enforced throttling.
- **Example payloads**:

```json
POST /ingest/task-runs
{
  "schema_version": "v0",
  "idempotency_key": "alpha-run-001",
  "task_type": "portfolio-optimizer",
  "task_label": "alpha:portfolio",
  "status": "completed",
  "timing": {
    "started_at": "2024-07-01T00:00:00Z",
    "completed_at": "2024-07-01T00:00:04Z"
  },
  "metrics": {
    "raw_throughput": 2.4,
    "tokens_processed": 9231,
    "tool_calls": 3,
    "quality_score": 0.94
  },
  "metadata": { "environment": "prod", "steps": 8 },
  "notes": "routed via meta-agentic swarm"
}
```

```json
POST /ingest/energy
{
  "schema_version": "v0",
  "task": { "idempotency_key": "alpha-run-001" },
  "energy": {
    "kwh": 0.42,
    "energy_mix": "hydro",
    "carbon_intensity_gco2_kwh": 12,
    "cost_usd": 0.031,
    "region": "ca-central-1"
  }
}
```

```json
POST /ingest/quality
{
  "schema_version": "v0",
  "task": { "external_id": "42" },
  "quality": {
    "evaluator": "provider",
    "score": 0.97,
    "notes": "meets governance acceptance threshold"
  }
}
```

```json
POST /ingest/validator-consensus
{
  "schema_version": "v0",
  "provider": { "provider_id": 12 },
  "measurement_date": "2024-07-01",
  "reproducibility": 0.82,
  "notes": "deterministic replays across 5 identical prompts"
}
```

## Synthetic labor scoring engine (SLU)

> Daily conversion of telemetry into **Synthetic Labor Units (SLU)** per provider, with deterministic difficulty, energy, quality, and validator consensus factors baked into the ledger and stored in `synthetic_labor_scores`.

```mermaid
flowchart TB
  subgraph Inputs[Telemetry Inputs]
    tr[Task runs\n• throughput\n• tokens\n• tool calls\n• steps]
    en[Energy reports\n• kWh\n• cost_usd]
    qu[Quality evals\n• human / auto scores]
    vcSig[Validator consensus\n• reproducibility rate]
  end

  subgraph Factors[Adjustment Factors]
    diff[Difficulty\nnormalized to baseline bundle]
    ea[Energy Adjustment\nbaseline_cost_per_slu / observed_cost_per_slu]
    qa[Quality Adjustment\nwinsorized mean vs baseline]
    vc[Validator Consensus\nreproducibility stub]
  end

  Inputs --> diff
  Inputs --> ea
  Inputs --> qa
  Inputs --> vc

  subgraph Synth[SLU Forge]
    sumRaw[Σ(raw_throughput × difficulty)]
    computeSLU[SLU = raw × EA × QA × VC]
  end

  diff --> sumRaw
  ea --> computeSLU
  qa --> computeSLU
  vc --> computeSLU
  sumRaw --> computeSLU
  computeSLU --> db[(synthetic_labor_scores)]
```

- **Difficulty coefficient**: blends task-type baselines with telemetry intensity (`tokens_processed`, `tool_calls`, `steps`), normalizing to ~1.0 for the reference bundle while respecting task-type difficulty weights.
- **Energy adjustment (EA)**: `EA = baseline_cost_per_slu / observed_cost_per_slu` with caps to prevent outliers; estimated cost derived from `energy_reports.cost_usd` or `kWh × baseline price` when cost is absent.
- **Quality adjustment (QA)**: winsorized quality signals (task-run quality plus gold evaluations) normalized against baseline quality (0.9) and bounded to avoid runaway boosts.
- **Validator consensus (VC)**: reproducibility rate from repeated test runs, aggregated per task type/day; defaults to `1.0` when sparse.
- **Daily job**: `node src/index.js score:daily --date YYYY-MM-DD` persists per-provider rows with `{ raw_throughput, energy_adjustment, quality_adjustment, consensus_factor, slu, metadata }` inside `synthetic_labor_scores`.
- **Synthetic labor seeds**: `npm run db:seed` hydrates providers and task archetypes so SLU scoring is immediately runnable.

## Provider authentication & deduplication

- **Auth**: `X-API-Key` or `Authorization: Bearer <api-key>`; keys are stored hashed and scoped per provider with last-used timestamps and labels.
- **Idempotency**: `idempotency_key` on `TaskRunTelemetry` is mandatory; duplicates are rejected with payload-hash verification to detect collisions.
- **Task resolution**: Energy, quality, and validator-consensus payloads resolve task runs by `idempotency_key` or `external_id`; missing runs yield a 404 with a structured message.
- **Suspicious patterns**: Collisions and malformed payloads are logged for operator review.

## Owner controls & on-chain levers

- **Total command**: The owner (or multisig) can pause/unpause, rotate validators, update identity controllers, flip identity status, revoke identities, withdraw stake, and apply slashes—all exposed in `AlphaNodeManager` without redeployment.
- **Sovereign staking**: Owner-initiated stake withdrawals and validator-gated recording ensure rewards remain under explicit operator control; staking token hard-bound to `$AGIALPHA` (`0xa61a3b3a130a9c20768eebf97e21515a6046a1fa`, 18 decimals).
- **Governance payload builder**: `/governance` endpoints and `src/services/governance.js` craft calldata with dry-run previews, ledger recording, and signature fields for multisig submission.
- **Health gates**: `scripts/verify-health-gate.mjs` enforces operational readiness; `scripts/verify-branch-gate.mjs` blocks unsafe branches, mirroring branch protection on `main`.

## Data spine & migrations

- **Schema**: Core tables (`providers`, `task_types`, `task_runs`, `energy_reports`, `quality_evaluations`, `synthetic_labor_scores`, `index_values`) live in SQLite with index coverage for provider + day queries.
- **Migrations**: `npm run db:migrate` applies migration files; `npm run db:seed` hydrates baseline providers, task archetypes, and telemetry exemplars.
- **Subgraph alignment**: `scripts/render-subgraph-manifest.mjs` keeps `subgraph/` manifests synchronized with runtime schemas for downstream indexing.

## CI, gates, and release discipline

- **Workflow coverage**: CI runs markdown lint, link checks, tests, coverage (`c8 + vitest`), Solidity lint/compile, subgraph TypeScript build, Docker smoke test, security audit, and badge publication (`.github/workflows/ci.yml`).
- **Required on PR & main**: All checks are enforced via `.github/required-checks.json`; PRs must satisfy every gate before merge, and the CI badge above reflects the `main` branch posture.
- **Local equivalence**: `npm run lint`, `npm test`, `npm run coverage`, `npm run ci:solidity`, and `npm run ci:ts` mirror pipeline behavior so contributors can reproduce the green status offline.

## Operations playbook

- **Run locally**: `npm start` boots the API + orchestration server; `npm run demo:local` launches the local cluster simulator.
- **CLI help**: `node src/index.js --help` lists governance, staking, lifecycle, telemetry, scoring, and antifragility commands.
- **Observability**: OpenTelemetry exporters (`src/telemetry/otel*.ts`) emit traces; `src/telemetry/monitoring.js` exposes Prometheus metrics and health probes.
- **Docker & Helm**: `docker build -t agi-alpha-node:local .` for containerized deployment; Helm chart scaffolding lives at `deploy/helm/agi-alpha-node`.
- **Database maintenance**: `npm run db:migrate` / `npm run db:seed` keep the data spine aligned with schemas; backups are simple file copies of the SQLite database path.

## Repository atlas

- **Contracts**: Owner-first surfaces in `contracts/AlphaNodeManager.sol` (pausing, validator rotation, identity lifecycle, staking), with access control in `contracts/access/` and interfaces in `contracts/interfaces/`.
- **Runtime entrypoint**: `src/index.js` (CLI + orchestration), `src/network/apiServer.js` (HTTP ingestion), `src/services/telemetryIngestion.js` (schema validation, auth, dedup), `src/services/syntheticLaborEngine.js` (SLU computation), `src/telemetry/` (OTel exporters), `src/persistence/` (SQLite), and `src/constants/` (token, work unit settings).
- **Docs**: `docs/` contains operator codex, economics, identity guidance, and manifesto; `spec/` holds JSON Schemas for telemetry payloads.
- **Scripts**: `scripts/` includes CI gates, ENS inspection, badge publishing, subgraph rendering, and husky preparation.
- **Subgraph**: `subgraph/` houses Graph Protocol manifests, codegen config, and build scripts mirrored in CI.

## Appendix: Specs & references

- **Telemetry schemas**: `spec/task_run_telemetry.schema.json`, `spec/energy_report.schema.json`, `spec/quality_eval.schema.json`, `spec/validator_consensus.schema.json` (all v0).
- **Persistence**: `src/persistence/database.js` (bootstrap), repositories in `src/persistence/repositories.js`, seeds in `src/persistence/seeds.js`.
- **Ingestion services**: `src/services/telemetryIngestion.js` (validation, auth, rate-limit stubs, deduplication, persistence).
- **Network APIs**: `src/network/apiServer.js` exposes ingestion endpoints, governance payload builders, lifecycle routes, and oracle exports.
- **Token constants**: `$AGIALPHA` checksum address & decimals defined in `src/constants/token.js`.
- **Health & gates**: Policy checks live in `scripts/verify-health-gate.mjs` and `scripts/verify-branch-gate.mjs`.
