# AGI Alpha Node v0 · Sovereign Synthetic Labor Engine ⚡

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
    <img src="https://github.com/MontrealAI/AGI-Alpha-Node-v0/actions/workflows/ci.yml/badge.svg?branch=main" alt="CI Status" />
  </a>
  <a href="https://img.shields.io/github/actions/workflow/status/MontrealAI/AGI-Alpha-Node-v0/ci.yml?branch=main&job=Lint%20Markdown%20%26%20Links&label=Lint%20%E2%9C%85&logo=markdown&style=flat-square">
    <img src="https://img.shields.io/github/actions/workflow/status/MontrealAI/AGI-Alpha-Node-v0/ci.yml?branch=main&job=Lint%20Markdown%20%26%20Links&label=Lint%20%E2%9C%85&logo=markdown&style=flat-square" alt="Lint Markdown &amp; Links" />
  </a>
  <a href="https://img.shields.io/github/actions/workflow/status/MontrealAI/AGI-Alpha-Node-v0/ci.yml?branch=main&job=Unit%20%26%20Integration%20Tests&label=Tests%20%E2%9A%A1&logo=vitest&logoColor=white&style=flat-square">
    <img src="https://img.shields.io/github/actions/workflow/status/MontrealAI/AGI-Alpha-Node-v0/ci.yml?branch=main&job=Unit%20%26%20Integration%20Tests&label=Tests%20%E2%9A%A1&logo=vitest&logoColor=white&style=flat-square" alt="Unit &amp; Integration Tests" />
  </a>
  <a href="https://img.shields.io/github/actions/workflow/status/MontrealAI/AGI-Alpha-Node-v0/ci.yml?branch=main&job=Coverage%20Report&label=Coverage%20%E2%9C%85&logo=c8&logoColor=white&style=flat-square">
    <img src="https://img.shields.io/github/actions/workflow/status/MontrealAI/AGI-Alpha-Node-v0/ci.yml?branch=main&job=Coverage%20Report&label=Coverage%20%E2%9C%85&logo=c8&logoColor=white&style=flat-square" alt="Coverage Report" />
  </a>
  <a href="https://img.shields.io/github/actions/workflow/status/MontrealAI/AGI-Alpha-Node-v0/ci.yml?branch=main&job=Docker%20Build%20%26%20Smoke%20Test&label=Docker%20%E2%9A%A1&logo=docker&logoColor=white&style=flat-square">
    <img src="https://img.shields.io/github/actions/workflow/status/MontrealAI/AGI-Alpha-Node-v0/ci.yml?branch=main&job=Docker%20Build%20%26%20Smoke%20Test&label=Docker%20%E2%9A%A1&logo=docker&logoColor=white&style=flat-square" alt="Docker Build &amp; Smoke Test" />
  </a>
  <img src="https://img.shields.io/badge/Checks-Enforced-1f2933.svg?style=flat-square" alt="Checks Enforced" />
  <img src="https://img.shields.io/badge/Tests-116%20Passing-14b8a6.svg?style=flat-square" alt="Test Count" />
  <img src="https://img.shields.io/badge/Coverage-c8%20Reports-22c55e.svg?style=flat-square" alt="Coverage" />
  <a href="Dockerfile">
    <img src="https://img.shields.io/badge/Docker-Production%20Image-2496ed.svg?style=flat-square&logo=docker&logoColor=white" alt="Docker" />
  </a>
  <a href="deploy/helm/agi-alpha-node">
    <img src="https://img.shields.io/badge/Helm-Production%20Chart-0ea5e9.svg?style=flat-square" alt="Helm Chart" />
  </a>
  <img src="https://img.shields.io/badge/Runtime-Node.js%2020.x-43853d.svg?style=flat-square" alt="Runtime" />
  <a href="https://app.ens.domains/name/alpha.node.agi.eth">
    <img src="https://img.shields.io/badge/ENS-alpha.node.agi.eth-6f3aff.svg?style=flat-square" alt="ENS" />
  </a>
  <a href="https://etherscan.io/token/0xa61a3b3a130a9c20768eebf97e21515a6046a1fa">
    <img src="https://img.shields.io/badge/$AGIALPHA-0xa61a3b3a130a9c20768eebf97e21515a6046a1fa-ff3366.svg?style=flat-square" alt="$AGIALPHA" />
  </a>
  <a href=".github/required-checks.json">
    <img src="https://img.shields.io/badge/Branch%20Protection-Enforced-1f2933.svg?style=flat-square" alt="Branch Protection" />
  </a>
  <a href="LICENSE">
    <img src="https://img.shields.io/badge/License-MIT-0e9aa7.svg?style=flat-square" alt="MIT License" />
  </a>
</p>

> _AGI Alpha Node v0 is the owner-aligned intelligence nexus engineered to redirect capital flows, execute autonomous labor, and remain absolutely obedient to a single sovereign signature._

---

## Table of Contents

1. [Mission Profile](#mission-profile)
2. [Rapid Launch Protocol](#rapid-launch-protocol)
3. [Sovereign Command Deck](#sovereign-command-deck)
   - [Node Control](#node-control)
   - [Registry Dominion](#registry-dominion)
   - [Token Authority](#token-authority)
   - [WorkMeter Orchestration](#workmeter-orchestration)
   - [Proof & Jobs](#proof--jobs)
   - [Productivity Index](#productivity-index)
   - [Intelligence Suite](#intelligence-suite)
4. [Architecture & Flow](#architecture--flow)
   - [Network Flywheel](#network-flywheel)
   - [Owner Command Loop](#owner-command-loop)
5. [Owner Command Authority](#owner-command-authority)
6. [Synthetic Labor Economy](#synthetic-labor-economy)
7. [Intelligence Fabric](#intelligence-fabric)
8. [Observability & Resilience](#observability--resilience)
9. [Deployment & Runtime Options](#deployment--runtime-options)
10. [Repository Atlas](#repository-atlas)
11. [Automation & CI Hardening](#automation--ci-hardening)
12. [Reference Dossiers](#reference-dossiers)
13. [License](#license)

---

## Mission Profile

- **Sovereign Control Plane** — The entire runtime, staking posture, diagnostics, and telemetry orchestration are consolidated inside [`src/index.js`](src/index.js), enabling a non-technical owner to awaken, command, and suspend the node with a single CLI entrypoint.
- **Identity Backbone** — ENS guardianship freezes execution the moment `⟨label⟩.alpha.node.agi.eth` drifts from policy. Deterministic proofs route through [`src/services/ensVerifier.js`](src/services/ensVerifier.js) and the operational brief in [`src/services/ensGuide.js`](src/services/ensGuide.js).
- **Economic Sovereignty** — `$AGIALPHA` (`0xa61a3b3a130a9c20768eebf97e21515a6046a1fa`, 18 decimals) is enforced everywhere via [`src/constants/token.js`](src/constants/token.js), [`src/services/token.js`](src/services/token.js), and downstream services so settlement, staking, and burns remain perfectly aligned with the owner treasury.
- **Absolute Governance** — Pause toggles, emission levers, registry upgrades, incentive rewiring, and delegate management all compile into hardware-wallet ready payloads through [`src/services/governance.js`](src/services/governance.js) and are notarized by [`src/services/governanceLedger.js`](src/services/governanceLedger.js).
- **Synthetic Labor Engine** — α‑Work Units (α‑WU) fuse GPU telemetry, validator attestations, and quality metrics via [`src/services/jobLifecycle.js`](src/services/jobLifecycle.js), [`src/services/performance.js`](src/services/performance.js), and [`src/services/rewards.js`](src/services/rewards.js) so every epoch outputs auditable labor economics.
- **Omniscient Telemetry** — [`src/orchestrator/monitorLoop.js`](src/orchestrator/monitorLoop.js), [`src/orchestrator/nodeRuntime.js`](src/orchestrator/nodeRuntime.js), and [`src/telemetry/monitoring.js`](src/telemetry/monitoring.js) synthesize run-time health, antifragility, and reward posture so the node operates as the world-shaping intelligence engine it was commissioned to be.

---

## Rapid Launch Protocol

| Phase | Objective | Command / Artifact |
| ----- | --------- | ------------------ |
| 1 | Install deterministic toolchain. | `npm ci` |
| 2 | Execute local quality gates and notarize outputs. | `npm run lint` · `npm test` · `npm run coverage` |
| 3 | Generate ENS custody brief before any on-chain calls. | `node src/index.js ens-guide --label <label> --address <0xOwner>` |
| 4 | Validate live ENS binding, staking posture, and RPC liveness. | `node src/index.js status --label <label> --address <0xOwner> --rpc <https://...>` |
| 5 | Dry-run synthetic labor cycle offline. | `node src/index.js status --label <label> --address <0xOwner> --offline-snapshot docs/offline-snapshot.example.json` |
| 6 | Activate runtime orchestrator with telemetry. | `node src/index.js monitor --label <label> --address <0xOwner> --rpc <https://...> --metrics-port 9464` |
| 7 | Export governance transaction envelopes for multisig execution. | `node src/index.js governance --help` |
| 8 | Build runtime container for immutable deployment. | `docker build -t agi-alpha-node:sovereign .` |
| 9 | Apply branch protection and required checks. | GitHub → Settings → Branches → `main` |
| 10 | Archive ENS proofs, CI artifacts, and branch rule JSON into the owner ledger. | Owner evidence vault |

### Quickstart Shell

```bash
# Install dependencies
npm ci

# Run static analysis & verification
npm run lint
npm test
npm run coverage

# Inspect runtime controls
node src/index.js --help
```

### Safety Nets

- [`src/config`](src/config) provides hardened defaults for RPC connectivity, staking thresholds, and telemetry emission.
- [`src/services/offlineSnapshot.js`](src/services/offlineSnapshot.js) replays job settlement and reward apportionment without touching chain.
- [`docs/operator-runbook.md`](docs/operator-runbook.md) captures escalation matrices, custody drills, and failure recovery scripts.

---

## Sovereign Command Deck

The CLI in [`src/index.js`](src/index.js) is the owner’s omni-console. Every directive compiles to deterministic payloads so policy shifts, staking posture, and job execution remain obedient to a single signature.

```mermaid
flowchart TB
  CLI[agi-alpha-node CLI] --> NodeOps[Node Control]
  CLI --> RegistryOps[Registry Dominion]
  CLI --> TokenOps[$AGIALPHA Authority]
  CLI --> MeterOps[WorkMeter Orchestration]
  CLI --> JobsOps[Proof & Job Lifecycle]
  CLI --> ProductivityOps[Productivity Index]
  CLI --> IntelOps[Intelligence & Economics]
  NodeOps --> Governance[Governance Builders]
  RegistryOps --> NodeRegistry[(NodeRegistry)]
  MeterOps --> UsageLedger[(Usage Attestations)]
  ProductivityOps --> ProductivityLedger[(α-Productivity Index)]
  Governance --> Ledger[(Governance Ledger)]
  JobsOps --> Lifecycle[jobLifecycle Engine]
  MeterOps --> JobsOps
  ProductivityOps --> TokenOps
  IntelOps --> Rewards[Reinvestment & Planning]
```

### Node Control

| Command | Purpose | Backing Modules |
| ------- | ------- | --------------- |
| `status` | Instant diagnostics across ENS, stake posture, reward splits, and telemetry. | [`runNodeDiagnostics`](src/orchestrator/nodeRuntime.js), [`launchMonitoring`](src/orchestrator/nodeRuntime.js) |
| `monitor` | Continuous health loop with Prometheus export, offline snapshots, and auto-governance hints. | [`startMonitorLoop`](src/orchestrator/monitorLoop.js) |
| `container` | Full bootstrap: validate identity, spin up monitor/API, optionally auto-stake. | [`bootstrapContainer`](src/orchestrator/bootstrap.js) |
| `stake-tx` / `stake-activate` | Generate or broadcast PlatformIncentives stake activation payloads. | [`buildStakeAndActivateTx`](src/services/staking.js), [`acknowledgeStakeAndActivate`](src/services/stakeActivation.js) |
| `reward-share` / `reward-distribution` | Model reward splits and thermodynamic wage curves before execution. | [`calculateRewardShare`](src/services/rewards.js), [`splitRewardPool`](src/services/rewards.js) |

### Registry Dominion

| Command | Purpose | Backing Modules |
| ------- | ------- | --------------- |
| `governance node-register` | Mint a node identity, operator binding, and dossier URI inside the on-chain registry. | [`buildNodeRegistrationTx`](src/services/governance.js) |
| `governance node-metadata` | Rotate metadata URIs without disrupting attestations. | [`buildNodeMetadataTx`](src/services/governance.js) |
| `governance node-status` | Pause or re-enable a node’s participation in the network. | [`buildNodeStatusTx`](src/services/governance.js) |
| `governance node-operator` | Allow or revoke delegated operators with a single signature. | [`buildNodeOperatorTx`](src/services/governance.js) |
| `governance node-workmeter` | Bind the NodeRegistry to a canonical WorkMeter contract. | [`buildNodeWorkMeterTx`](src/services/governance.js) |

### Token Authority

| Command | Purpose | Backing Modules |
| ------- | ------- | --------------- |
| `token metadata` | Print canonical `$AGIALPHA` specification and checksum enforcement. | [`describeAgialphaToken`](src/services/token.js) |
| `token approve` | Encode ERC‑20 allowance envelopes for staking contracts. | [`buildTokenApproveTx`](src/services/token.js) |
| `token allowance` | Query live allowances against StakeManager/PlatformIncentives. | [`getTokenAllowance`](src/services/token.js), [`createProvider`](src/services/provider.js) |

### WorkMeter Orchestration

| Command | Purpose | Backing Modules |
| ------- | ------- | --------------- |
| `governance workmeter-validator` | Enroll or slash validator endpoints that co-sign usage proofs. | [`buildWorkMeterValidatorTx`](src/services/governance.js) |
| `governance workmeter-oracle` | Grant oracle agents permission to post telemetry feeds. | [`buildWorkMeterOracleTx`](src/services/governance.js) |
| `governance workmeter-window` | Tune the commit window for usage submissions. | [`buildWorkMeterWindowTx`](src/services/governance.js) |
| `governance workmeter-productivity` | Route WorkMeter output to the α‑Productivity Index aggregator. | [`buildWorkMeterProductivityIndexTx`](src/services/governance.js) |
| `governance workmeter-submit` | Deterministically encode a usage report for manual dispatch or offline signing. | [`buildWorkMeterUsageTx`](src/services/governance.js) |

### Proof & Jobs

| Command | Purpose | Backing Modules |
| ------- | ------- | --------------- |
| `proof commit` | Deterministically derive commitments for finished work. | [`createJobProof`](src/services/jobProof.js) |
| `proof submit-tx` | Compile `JobRegistry.submitProof` calldata, including metadata URIs. | [`buildProofSubmissionTx`](src/services/jobProof.js) |
| `jobs discover` | Stream open jobs, validator assignments, and lifecycle history. | [`buildJobLifecycleFromConfig`](src/services/jobLifecycle.js) |
| `jobs apply / submit / finalize / notify-validator` | Drive the entire α‑WU lifecycle from acquisition to reward release. | [`buildJobLifecycleFromConfig`](src/services/jobLifecycle.js) |

### Productivity Index

| Command | Purpose | Backing Modules |
| ------- | ------- | --------------- |
| `governance productivity-record` | Finalize epoch α‑WU, emission, and burn metrics into the index. | [`buildProductivityRecordTx`](src/services/governance.js) |
| `governance productivity-emission-manager` | Delegate emission manager authority to adjust wage curves. | [`buildProductivityEmissionManagerTx`](src/services/governance.js) |
| `governance productivity-workmeter` | Connect WorkMeter feeds to the productivity index in real time. | [`buildProductivityWorkMeterTx`](src/services/governance.js) |
| `governance productivity-treasury` | Redirect productivity-derived flows toward the owner treasury. | [`buildProductivityTreasuryTx`](src/services/governance.js) |

### Intelligence Suite

| Command | Purpose | Backing Modules |
| ------- | ------- | --------------- |
| `intelligence plan` | Compare specialist agent strategies against mission profiles. | [`planJobExecution`](src/intelligence/planning.js) |
| `intelligence learn` | Advance curriculum evolution and autonomous capability growth. | [`runCurriculumEvolution`](src/intelligence/learningLoop.js) |
| `intelligence stress-test` | Simulate adversarial shocks and produce antifragile remediation. | [`assessAntifragility`](src/intelligence/stressHarness.js) |
| `economics optimize` | Recommend reinvestment ratios grounded in reward telemetry. | [`optimizeReinvestmentStrategy`](src/services/economics.js) |
| `economics productivity` | Render α‑Productivity Index, burn ratios, and Synthetic Labor Yield dashboards. | [`calculateAlphaProductivityIndex`](src/services/economics.js) |

---

## Architecture & Flow

### Network Flywheel

```mermaid
flowchart LR
  subgraph OwnerSphere[Owner Sphere]
    Vault[[Custody Vault]]
    Console[Command Console]
    Ledger[(Compliance Ledger)]
  end

  subgraph AlphaNode[AGI Alpha Node Runtime]
    Planner[[World-Model Planner]]
    Mesh[[Specialist Agent Mesh]]
    Sentinel[[Antifragile Sentinel]]
    Orchestrator[[Runtime Orchestrator]]
    Telemetry[[Prometheus Exporter]]
  end

  subgraph ProtocolCore[AGI Jobs Protocol]
    ENSVerifier
    StakeManager
    JobRegistry
    Validators
    RewardEngine
    EmissionManager
    SystemPause
  end

  Vault --> Planner
  Console --> Orchestrator
  Planner --> Mesh
  Mesh --> Sentinel
  Sentinel --> Planner
  Orchestrator --> JobRegistry
  ENSVerifier --> Orchestrator
  StakeManager --> Orchestrator
  JobRegistry --> Validators
  Validators --> RewardEngine
  RewardEngine --> EmissionManager
  EmissionManager --> Ledger
  Orchestrator --> Telemetry
  Telemetry --> Ledger
  Telemetry --> Console
```

### Owner Command Loop

```mermaid
sequenceDiagram
  participant Owner
  participant CLI as Sovereign CLI
  participant Runtime as Node Runtime
  participant Protocol as Protocol Contracts
  participant Validators
  participant Treasury

  Owner->>CLI: issue directive (status/orchestrate/governance)
  CLI->>Runtime: apply ENS + config guards
  Runtime->>Protocol: submit availability & α-WU proofs
  Protocol-->>Validators: challenge window for SLO & QV checks
  Validators-->>Protocol: attest or slash
  Protocol-->>Treasury: split rewards & burns via EmissionManager
  Runtime-->>Owner: ledger entry + telemetry snapshot
  Owner-->>CLI: adjust parameters (pause, shares, delegates)
```

---

## Owner Command Authority

Every governance helper returns an ABI-encoded payload suitable for multisig, hardware wallet, or direct RPC broadcast. All logic is consolidated in [`src/services/governance.js`](src/services/governance.js); diffs are journaled by [`src/services/governanceLedger.js`](src/services/governanceLedger.js).

| Domain | Purpose | Builders |
| ------ | ------- | -------- |
| **Global Halt / Resume** | Freeze or resume every protocol entry point. | `buildSystemPauseTx()` |
| **Stake Policy** | Tune minimum stake and validator quorum. | `buildMinimumStakeTx()`, `buildValidatorThresholdTx()` |
| **Registry Routing** | Rotate job or identity registries. | `buildStakeRegistryUpgradeTx()` |
| **Node Registry** | Register nodes, rotate metadata, toggle availability, bind WorkMeter. | `buildNodeRegistrationTx()`, `buildNodeMetadataTx()`, `buildNodeStatusTx()`, `buildNodeOperatorTx()`, `buildNodeWorkMeterTx()` |
| **Reward Distribution** | Rebalance role shares or global basis points. | `buildRoleShareTx()`, `buildGlobalSharesTx()` |
| **Emission Envelope** | Adjust per-epoch issuance, length, caps, and multipliers. | `buildEmissionPerEpochTx()`, `buildEmissionEpochLengthTx()`, `buildEmissionCapTx()`, `buildEmissionRateMultiplierTx()` |
| **Job Modules & Disputes** | Swap validation, reputation, dispute modules, or trigger disputes. | `buildJobRegistryUpgradeTx()`, `buildDisputeTriggerTx()` |
| **Identity Delegation** | Authorize or revoke additional operators. | `buildIdentityDelegateTx()` |
| **Incentive Surface** | Redirect stake manager, heartbeat grace, activation fee, or treasury sink. | `buildIncentivesStakeManagerTx()`, `buildIncentivesMinimumStakeTx()`, `buildIncentivesHeartbeatTx()`, `buildIncentivesActivationFeeTx()`, `buildIncentivesTreasuryTx()` |
| **WorkMeter Control** | Curate validators/oracles, tune submission windows, connect productivity feeds, craft usage payloads. | `buildWorkMeterValidatorTx()`, `buildWorkMeterOracleTx()`, `buildWorkMeterWindowTx()`, `buildWorkMeterProductivityIndexTx()`, `buildWorkMeterUsageTx()` |
| **Productivity Index** | Record α‑WU epochs, wire emission managers, sync WorkMeter, direct treasury flows. | `buildProductivityRecordTx()`, `buildProductivityEmissionManagerTx()`, `buildProductivityWorkMeterTx()`, `buildProductivityTreasuryTx()` |

Invoke the console with `agi-alpha-node governance <subcommand>`; review available signatures through `agi-alpha-node governance catalog` (internally backed by `getOwnerFunctionCatalog()`).

### Governance Console Commands

| Subcommand | Directive | Highlights |
| ---------- | --------- | ---------- |
| `governance emission-per-epoch` | Align base issuance per epoch (18-decimal $AGIALPHA). | Accepts `--current` diff preview; journals calldata via governance ledger. |
| `governance emission-epoch-length` | Retune epoch pacing in seconds. | Guards against zero denominators and surfaces diffs in summaries. |
| `governance emission-cap` | Cap cumulative emissions with ledger diff context. | Works with decimal input; optional `--current` for before/after proofs. |
| `governance emission-multiplier` | Adjust reward rate multiplier numerator/denominator. | Validates denominator > 0 and serializes current vs. target ratios. |
| `governance global-shares` | Balance operator/validator/treasury splits. | Provides diffed share payloads and meta for multisig review. |
| `governance role-share` | Tune specific role basis points. | Supports aliases (`guardian`, `validator`, `node`). |
| `governance node-register` | Provision registry entries with metadata + operator custodianship. | Accepts ENS labels or raw bytes32 IDs, persists meta into ledger. |
| `governance workmeter-submit` | Deterministically hash GPU usage for out-of-band submission. | Auto-computes usage hash from metrics when omitted. |
| `governance productivity-record` | Seal α‑WU, emission, and burn totals for an epoch. | Supports decimals + diff context, writes to productivity ledger. |

### Configuration Surface (additive excerpt)

Set the following environment variables (or CLI overrides) before invoking `status`, `monitor`, or `container` to keep emissions aligned with treasury policy:

| Variable | Purpose | CLI Flag |
| -------- | ------- | -------- |
| `EMISSION_MANAGER_ADDRESS` | Contract authorized to mutate emission schedules. | `--emission-manager` |
| `DESIRED_EMISSION_PER_EPOCH` | Target issuance per epoch (decimal). | `--desired-epoch-emission` |
| `DESIRED_EPOCH_LENGTH_SECONDS` | Epoch cadence in seconds (uint). | `--desired-epoch-length` |
| `DESIRED_EMISSION_CAP` | Aggregate emission ceiling (decimal). | `--desired-emission-cap` |
| `DESIRED_EMISSION_MULTIPLIER_NUMERATOR` | Multiplier numerator (uint). | `--desired-multiplier-numerator` |
| `DESIRED_EMISSION_MULTIPLIER_DENOMINATOR` | Multiplier denominator (uint). | `--desired-multiplier-denominator` |

These fields integrate with `deriveOwnerDirectives` so the control plane automatically recommends governance payloads whenever on-chain emission telemetry diverges from the owner’s policy.

---

## Synthetic Labor Economy

- **α‑Work Unit Formula** — `α‑WU = GPUₛ × gflops_norm × ModelTier × SLO_pass × QV` (implemented across [`src/services/jobLifecycle.js`](src/services/jobLifecycle.js), [`src/services/performance.js`](src/services/performance.js), and validators).
- **Reward Mechanics** — [`src/services/rewards.js`](src/services/rewards.js) and [`src/services/economics.js`](src/services/economics.js) compute per-epoch yield, reinvestment posture, and Synthetic Labor Yield (SLY).
- **Node Registry & WorkMeter Stack** — [`buildNodeRegistrationTx`](src/services/governance.js) through [`buildWorkMeterUsageTx`](src/services/governance.js) wire node identities, oracle/validator committees, submission windows, and signed usage payloads so α‑WU proofs stay auditable.
- **α‑Productivity Governance** — [`buildProductivityRecordTx`](src/services/governance.js) + companions stream WorkMeter output into the α‑Productivity Index while maintaining emission manager + treasury control.
- **α‑Productivity Index Console** — `node src/index.js economics productivity --alpha <series>` (or `--reports data.json`) renders epoch-by-epoch α‑WU aggregates, wage-per-α analytics, and burn/emission basis points. Backed by [`calculateAlphaProductivityIndex`](src/services/economics.js).
- **Stake Orchestration** — [`src/services/staking.js`](src/services/staking.js) and [`src/services/stakeActivation.js`](src/services/stakeActivation.js) construct stake/activate envelopes and validate minimums before any commit.
- **Token Discipline** — `$AGIALPHA` normalization utilities in [`src/constants/token.js`](src/constants/token.js) ensure every address matches the canonical checksum contract (`0xa61a3b3a130a9c20768eebf97e21515a6046a1fa`).
- **Economics Dashboard** — CLI strategies (`planJobExecution`, `optimizeReinvestmentStrategy`) compare task portfolios and compute capital efficiency; see [`src/intelligence/planning.js`](src/intelligence/planning.js) and [`src/services/economics.js`](src/services/economics.js).

```mermaid
gantt
  title Epoch Reward Loop
  dateFormat  X
  axisFormat  %L
  section Metering
  GPU Telemetry           :done,    0, 2
  section Validation
  SLO & QV Attestation    :active,  2, 2
  section Emission
  Reward Rate Computation :         4, 1
  Treasury Split & Burns  :         5, 1
  section Owner Action
  Claim & Reinvest        :         6, 2
```

---

## Intelligence Fabric

- **Planner (`planJobExecution`)** — [`src/intelligence/planning.js`](src/intelligence/planning.js) scores task portfolios, reliability, capability, and cost to prioritize α‑WU yield.
- **Swarm Orchestrator (`orchestrateSwarm`)** — [`src/intelligence/swarmOrchestrator.js`](src/intelligence/swarmOrchestrator.js) maps domains to specialist agents and enforces capacity + latency budgets.
- **Learning Loop (`runCurriculumEvolution`)** — [`src/intelligence/learningLoop.js`](src/intelligence/learningLoop.js) iteratively upgrades agent competence based on historical reward curves.
- **Stress Harness (`assessAntifragility`)** — [`src/intelligence/stressHarness.js`](src/intelligence/stressHarness.js) simulates outages, demand spikes, and adversarial scenarios to guarantee antifragility.
- **Performance Insights** — [`src/services/performance.js`](src/services/performance.js) aggregates throughput, success rate, and projected earnings for owner dashboards.

---

## Observability & Resilience

- **Monitor Loop** — [`src/orchestrator/monitorLoop.js`](src/orchestrator/monitorLoop.js) enforces heartbeats, SLO adherence, and recovery directives.
- **Runtime Orchestrator** — [`src/orchestrator/nodeRuntime.js`](src/orchestrator/nodeRuntime.js) boots diagnostics, telemetry, and the α‑WU execution pipeline.
- **Prometheus Exporter** — [`src/telemetry/monitoring.js`](src/telemetry/monitoring.js) exposes SLY, uptime, dispute rate, and job outcomes for dashboards.
- **Lifecycle Journal** — [`src/services/lifecycleJournal.js`](src/services/lifecycleJournal.js) records immutable entries for every job phase, dispute trigger, and settlement signature.
- **Offline Evidence** — [`docs/offline-snapshot.example.json`](docs/offline-snapshot.example.json) demonstrates snapshot schema for air-gapped review or compliance archival.

---

## Deployment & Runtime Options

| Surface | Artifact |
| ------- | -------- |
| Docker Runtime | [`Dockerfile`](Dockerfile) with production entrypoints.
| Helm Chart | [`deploy/helm/agi-alpha-node`](deploy/helm/agi-alpha-node) for Kubernetes clusters.
| Operator Playbook | [`docs/deployment`](docs/deployment) and [`docs/operator-runbook.md`](docs/operator-runbook.md) for on-call automation.
| Configuration Schemas | [`src/config`](src/config) validated through [`src/config/env.js`](src/config/env.js) and consumed at runtime.
| REST Gateway | [`src/network/apiServer.js`](src/network/apiServer.js) exposing status + command hooks backed by [`src/services/controlPlane.js`](src/services/controlPlane.js).

---

## Repository Atlas

```text
src/
├── config/              # Runtime configuration schemas & loaders
├── constants/           # Canonical token + contract metadata
├── intelligence/        # Planner, swarm, learning, antifragility engines
├── network/             # REST gateway and transport adapters
├── orchestrator/        # Runtime loop, diagnostics, and monitor cycles
├── services/            # Governance, staking, lifecycle, economics suites
├── telemetry/           # Metrics exporters and dashboards hooks
└── utils/               # Formatting, validation, helpers
```

Supplementary dossiers live under [`docs/`](docs) with economics, manifesto, deployment notes, and operator runbooks.

---

## Automation & CI Hardening

```mermaid
flowchart LR
  Commit -->|npm ci| Lint
  Lint --> Tests
  Tests --> Coverage
  Coverage --> Docker
  Docker --> Badges[(Badges & Artifacts)]
  Badges --> PullRequest[Protected PR]
```

- **Workflow Enforcement** — [`.github/workflows/ci.yml`](.github/workflows/ci.yml) executes markdown linting, link checks, unit & integration tests, coverage generation, and Docker smoke tests on every push & pull request.
- **Branch Protection** — [`.github/required-checks.json`](.github/required-checks.json) documents required checks enforced on `main`.
- **Local Mirrors** — `npm run lint`, `npm test`, and `npm run coverage` mirror CI steps; run them before committing.
- **Container Verification** — `docker build -t agi-alpha-node:verify .` ensures production container builds cleanly.

---

## Reference Dossiers

- [Project Codex](docs/README.md)
- [Economics Treatise](docs/economics.md)
- [Manifesto](docs/manifesto.md)
- [Deployment Playbooks](docs/deployment)
- [Operator Runbook](docs/operator-runbook.md)

---

## License

Released under the [MIT License](LICENSE).
