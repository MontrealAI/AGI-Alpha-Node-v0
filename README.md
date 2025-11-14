# AGI Alpha Node v0 · Sovereign Cognition Orchestrator ⚡

<!-- markdownlint-disable MD013 MD033 -->
<p align="center">
  <picture>
    <source srcset="1.alpha.node.agi.eth.svg" type="image/svg+xml" />
    <img
      src="1.alpha.node.agi.eth.png"
      alt="AGI Alpha Node Insignia"
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
  <img src="https://img.shields.io/badge/PR%20Checks-Enforced%20on%20main-22c55e?logo=github" alt="Required Checks" />
  <img src="https://img.shields.io/badge/Coverage-Automated-0ea5e9?logo=vitest&logoColor=white" alt="Coverage" />
  <img src="https://img.shields.io/badge/Vitest-1.6-38bdf8?logo=vitest&logoColor=white" alt="Vitest" />
  <img src="https://img.shields.io/badge/Solidity-0.8.26-363636?logo=solidity&logoColor=white" alt="Solidity" />
  <img src="https://img.shields.io/badge/Node.js-20.18%2B-43853d?logo=node.js&logoColor=white" alt="Runtime" />
  <a href="Dockerfile">
    <img src="https://img.shields.io/badge/Docker-Production%20Image-2496ed?logo=docker&logoColor=white" alt="Docker" />
  </a>
  <a href="deploy/helm/agi-alpha-node">
    <img src="https://img.shields.io/badge/Helm-Ready-0ea5e9?logo=helm&logoColor=white" alt="Helm" />
  </a>
  <a href="docs/subgraph-deployment.md">
    <img src="https://img.shields.io/badge/Subgraph-Indexed-663399?logo=thegraph&logoColor=white" alt="Subgraph" />
  </a>
  <a href="https://etherscan.io/address/0xa61a3b3a130a9c20768eebf97e21515a6046a1fa">
    <img src="https://img.shields.io/badge/$AGIALPHA-0xa61a3b3a130a9c20768eebf97e21515a6046a1fa-ff3366?logo=ethereum&logoColor=white" alt="$AGIALPHA" />
  </a>
  <a href="LICENSE">
    <img src="https://img.shields.io/badge/License-MIT-10b981" alt="MIT" />
  </a>
</p>

> AGI Alpha Node v0 is the command lattice where deterministic cognition, provable metering, and owner-directed governance converge. It is the superintelligent machine that channels capital, telemetry, and alpha extraction with precision worthy of planetary infrastructure.

---

## Table of Contents

1. [Sovereign Mandate](#sovereign-mandate)
2. [System Constellation](#system-constellation)
3. [Alpha-WU Continuum](#alpha-wu-continuum)
4. [Alpha Evidence Schema](#alpha-evidence-schema)
5. [Lifecycle Journal & Governance Ledger](#lifecycle-journal--governance-ledger)
6. [Owner Mastery](#owner-mastery)
7. [Operational Launch](#operational-launch)
8. [Continuous Verification & CI](#continuous-verification--ci)
9. [Token Mechanics](#token-mechanics)
10. [Repository Atlas](#repository-atlas)
11. [Reference Library](#reference-library)

---

## Sovereign Mandate

AGI Alpha Node v0 is engineered so owners can redirect computation, staking posture, and validator policy in moments while maintaining crystalline observability. Every subsystem is tuned for high-stakes production, auditable within seconds, and runnable by a non-technical operator.

Highlights:

* **Deterministic cognition fabric** — lifecycle orchestration in `src/services/jobLifecycle.js` continuously reconciles job state with α-WU telemetry.
* **Adaptive capital routing** — the `AlphaNodeManager.sol` contract centralizes pausing, staking redirection, validator rotation, ENS rebinding, reward distribution, and penalty enforcement.
* **Tamper-evident journaling** — append-only lifecycle and governance ledgers produce deterministic hashes that can be replayed and diffed against on-chain truth.
* **Owner totality** — every critical parameter is owner-controlled via contract functions, CLI commands, or automation scripts; there are no external custodians.
* **$AGIALPHA economy** — the canonical 18-decimal token at [`0xa61a3b3a130a9c20768eebf97e21515a6046a1fa`](https://etherscan.io/address/0xa61a3b3a130a9c20768eebf97e21515a6046a1fa) fuels staking, validator compensation, and alpha flywheels.

---

## System Constellation

```mermaid
flowchart LR
  classDef runtime fill:#0f172a,stroke:#38bdf8,stroke-width:2px,color:#e0f2fe;
  classDef service fill:#111827,stroke:#f97316,stroke-width:2px,color:#f8fafc;
  classDef ledger fill:#1f2937,stroke:#84cc16,stroke-width:2px,color:#ecfccb;
  classDef telemetry fill:#1e1b4b,stroke:#a855f7,stroke-width:2px,color:#ede9fe;
  classDef ops fill:#0f172a,stroke:#facc15,stroke-width:2px,color:#fff7ed;

  Runtime[[src/index.js · CLI Spine]]:::runtime --> ControlPlane[[src/services/controlPlane.js · Runtime Supervisor]]:::service
  Runtime --> Lifecycle[[src/services/jobLifecycle.js · Job Registry Binding]]:::service
  Runtime --> Metering[[src/services/metering.js · α-WU Engine]]:::telemetry
  Runtime --> Provider[[src/services/provider.js · Device Enrolment]]:::service
  Lifecycle --> Proofs[[src/services/jobProof.js · Commitment Fabric]]:::service
  Lifecycle --> Journal[[src/services/lifecycleJournal.js · Append-Only Journal]]:::ledger
  Lifecycle --> GovLedger[[src/services/governanceLedger.js · Governance Ledger]]:::ledger
  Metering --> AlphaRegistry[[src/services/alphaWorkUnits.js · Sliding Windows]]:::telemetry
  Runtime --> Contracts[[contracts/AlphaNodeManager.sol · Owner Control Plane]]:::ledger
  Contracts --> Subgraph[[subgraph/ · Graph Protocol Surface]]:::telemetry
  Runtime --> Deploy[[deploy/ · Helm + Docker]]:::ops
  Runtime --> Docs[[docs/ · Economics & Runbooks]]:::ops
  Proofs --> CI[[.github/workflows/ci.yml · Enforced Checks]]:::telemetry
```

Every arrow is instrumented: services emit events, journals hash entries, and CI enforces deterministic builds. The architecture ensures the owner maintains a single source of truth spanning runtime, chain, and analytics surfaces.

---

## Alpha-WU Continuum

```mermaid
sequenceDiagram
  autonumber
  participant Registry as Job Registry
  participant Lifecycle as jobLifecycle
  participant Runtime as Node Runtime
  participant Meter as metering
  participant Proof as jobProof
  participant Ledger as governanceLedger
  participant Journal as lifecycleJournal
  participant Owner as Contract Owner

  Registry-->>Lifecycle: JobAssigned(jobId)
  Lifecycle-->>Runtime: job:update(status="assigned")
  Runtime->>Meter: startSegment(jobId, deviceInfo, modelClass, slaProfile)
  Runtime->>Meter: stopSegment(segmentId)
  Meter-->>Lifecycle: getJobAlphaWU(jobId)
  note over Meter,Lifecycle: α-WU totals resolved on completion
  Lifecycle->>Proof: createJobProof(..., alphaWU)
  Lifecycle->>Ledger: recordGovernanceAction(meta.method="submit", alphaWU)
  Ledger-->>Owner: Append-only record + hash chain
  Owner-->>Registry: finalize(jobId)
  Lifecycle-->>Journal: append(action="finalize", alphaWU)
```

The same α-WU snapshot powers runtime state, proof commitments, and ledger entries:

```jsonc
{
  "jobId": "0x…",
  "resultHash": "0x…",
  "resultURI": "ipfs://…",
  "alphaWU": {
    "total": 42.6,
    "bySegment": [
      {
        "segmentId": "seg-1",
        "modelClass": "LLM_8B",
        "slaProfile": "STANDARD",
        "gpuMinutes": 18.5,
        "qualityMultiplier": 1.3,
        "alphaWU": 24.05
      }
    ],
    "modelClassBreakdown": { "LLM_8B": 24.05 },
    "slaBreakdown": { "STANDARD": 24.05 },
    "qualityBreakdown": {
      "modelClass": { "LLM_8B": 24.05 },
      "sla": { "STANDARD": 24.05 }
    }
  }
}
```

`createJobProof` and `recordGovernanceAction` rely on `metering.getJobAlphaWU(jobId)` so completion events inherit the exact totals a validator observed. Journal snapshots embed the same data, ensuring every reward and policy change can be traced to concrete compute evidence.

---

## Alpha Evidence Schema

To make the α-WU continuum actionable, every surface normalizes the evidence payload into the same schema. The structures below are produced automatically — no manual wiring is required:

| Surface | Location | α-WU Payload | Notes |
| --- | --- | --- | --- |
| Runtime cache | [`src/services/jobLifecycle.js`](src/services/jobLifecycle.js) | `job.alphaWU` appended on completion using `metering.getJobAlphaWU(jobId)` | Owner dashboards and journal entries read from this cache. |
| Proof fabric | [`src/services/jobProof.js`](src/services/jobProof.js) | `alphaWU: { total, bySegment, modelClassBreakdown, slaBreakdown, quality, qualityBreakdown }` | Stays local yet cryptographically bound to the commitment payload. |
| Governance ledger | [`src/services/governanceLedger.js`](src/services/governanceLedger.js) | `meta.alphaWU` persists totals plus per-segment and quality slices | Applies to submissions, stake motions, and reward flows while retaining append-only hashing. |

```mermaid
classDiagram
  direction LR
  class AlphaWU {
    +float total
    +Segment[] bySegment
    +Record modelClassBreakdown
    +Record slaBreakdown
    +Record qualityModelClass
    +Record qualitySla
  }
  class Segment {
    +string segmentId
    +string jobId
    +string modelClass
    +string slaProfile
    +string deviceClass
    +number gpuMinutes
    +number qualityMultiplier
    +number alphaWU
  }
  JobLifecycle --> AlphaWU : caches
  JobProof --> AlphaWU : snapshots
  GovernanceLedger --> AlphaWU : serializes
```

This schema guarantees that journals, proofs, and governance records describe the same computation. Operators can diff ledgers, replay α-WU totals, and reconcile `bySegment` slices against metering windows within seconds.

---

## Lifecycle Journal & Governance Ledger

* **Lifecycle Journal (`src/services/lifecycleJournal.js`)** — append-only JSONL feed with deterministic metadata hashing. Each action entry includes normalized job metadata and α-WU breakdowns for effortless forensics.
* **Governance Ledger (`src/services/governanceLedger.js`)** — ledger writes for submissions, staking flows, and reward receipts append `meta.alphaWU` containing `total`, `modelClassBreakdown`, `slaBreakdown`, `bySegment`, and full quality slices while preserving append-only + hash continuity.
* **Snapshot integrity** — `computeJobMetadataHash` and ledger serialization convert BigInts and nested structures into stable digests. Replaying ledgers surfaces tampering immediately.

The ledgers and journal align runtime decisions with on-chain state, forming an auditable narrative around every alpha discovery.

---

## Owner Mastery

`contracts/AlphaNodeManager.sol` grants absolute operational authority. Key controls include:

| Capability | Function(s) | Description |
| --- | --- | --- |
| Circuit breaker | `pause()`, `unpause()` | Halt or resume staking, validator flows, and α-WU attestations instantly. |
| Validator curation | `setValidator(address,bool)` | Activate or retire validators entrusted with α-WU validation rights. |
| Identity graph | `registerIdentity(bytes32,address)`, `updateIdentityController(bytes32,address)`, `setIdentityStatus(bytes32,bool)`, `revokeIdentity(bytes32)` | Bind ENS nodes to controllers, rotate operators, toggle availability, and revoke identities without downtime. |
| Stake & treasury flow | `stake(uint256)`, `withdrawStake(address,uint256)` | Direct $AGIALPHA inflows or reroute balances to owner-selected destinations. |
| Alpha attestations | `recordAlphaWUMint(bytes32,address,address)`, `recordAlphaWUValidation(bytes32,uint256,uint256)`, `recordAlphaWUAcceptance(bytes32)` | Chronicle α-WU lifecycle events with owner overrides and validator accountability. |
| Enforcement | `applySlash(bytes32,address,uint256)` | Penalize validators directly from the command plane when ledger evidence demands corrective action. |
| State introspection | `getIdentity(address)`, `ensNodeController(bytes32)` | Audit operator bindings before issuing directives. |

The owner console spans CLI entry points (`src/index.js`), scripts in `scripts/`, and policy automation backed by deterministic ledgers.

---

## Operational Launch

1. **Install dependencies**

   ```bash
   npm install
   ```

2. **Configure environment** — copy `.env.example` to `.env`, then supply RPC URLs, registry addresses, telemetry sinks, and staking policy thresholds.
3. **Launch the node**

   ```bash
   npm start
   ```

4. **Run diagnostics**

   ```bash
   node scripts/verify-health-gate.mjs
   node scripts/verify-branch-gate.mjs
   ```

5. **Exercise governance flows** — import `createJobLifecycle` or `recordGovernanceAction` to craft owner payloads. α-WU telemetry is injected automatically for submissions, stake adjustments, and reward receipts.
6. **Replay ledgers** — inspect `.agi/lifecycle/actions.jsonl` and `.governance-ledger/v1/*.json` to surface hashes, α-WU breakdowns, and signature provenance with any JSON tooling.

For containerized rollouts, leverage `deploy/docker` for Compose stacks or `deploy/helm/agi-alpha-node` for Kubernetes clusters. Both ship with health probes and secret templates for immediate production alignment.

---

## Continuous Verification & CI

The GitHub Actions workflow [`ci.yml`](.github/workflows/ci.yml) enforces eight mandatory gates on every pull request and on `main`:

```text
lint → unit tests → coverage → solidity lint/build → subgraph codegen/build → npm audit → policy gates → branch policy
```

* **Branch protection** — the repository requires all checks to pass before merge. The `Required Checks` badge above reflects enforced status.
* **Local parity** — run the full suite before opening a PR:

  ```bash
  npm run ci:verify
  ```

* **Targeted checks** — each stage is invokable individually via `npm run ci:lint`, `npm run ci:test`, `npm run ci:coverage`, `npm run ci:solidity`, `npm run ci:ts`, `npm run ci:security`, `npm run ci:policy`, and `npm run ci:branch`.

This continuous verification spine ensures every artifact remains production-grade and merge-ready.

---

## Token Mechanics

* **Ticker:** `$AGIALPHA`
* **Decimals:** `18`
* **Contract:** [`0xa61a3b3a130a9c20768eebf97e21515a6046a1fa`](https://etherscan.io/address/0xa61a3b3a130a9c20768eebf97e21515a6046a1fa)
* **Economic flywheel:** more jobs completed → higher α-WU attestations → increased staking demand → elevated rewards → more agent and node onboarding.

Token flows, staking posture, and governance signatures are detailed in `docs/economics.md` and `docs/manifesto.md`.

---

## Repository Atlas

| Path | Description |
| --- | --- |
| `src/` | Runtime services (lifecycle, governance, metering, provider integration, telemetry exporters). |
| `contracts/` | Solidity control plane anchored by `AlphaNodeManager.sol`. |
| `deploy/` | Docker and Helm deployment manifests for production rollout. |
| `docs/` | Economic framing, operator guides, testing strategies, telemetry references. |
| `scripts/` | Automation for health gates, subgraph generation, simulations, and CI harnesses. |
| `subgraph/` | Graph Protocol manifest and TypeScript handlers for indexed visibility. |
| `test/` | Vitest suites covering lifecycle, governance, metering, economics, and policy logic. |

---

## Reference Library

* [docs/operator-runbook.md](docs/operator-runbook.md) — CLI usage, environment setup, and recovery procedures.
* [docs/alpha-wu.md](docs/alpha-wu.md) — α-WU specification, device tiers, and SLA multipliers.
* [docs/deployment/](docs/deployment/) — infrastructure blueprints, including Kubernetes and bare-metal paths.
* [docs/telemetry/](docs/telemetry/) — Prometheus metrics, dashboards, and alerting hooks.
* [docs/testing.md](docs/testing.md) — validation pathways before production deployments.

---

AGI Alpha Node v0 positions autonomous agent collectives to out-learn, out-strategize, and out-execute global markets. Every ledger entry, proof, and governance action is synchronized, authenticated, and owner-controlled — ready for immediate production-critical deployment.
