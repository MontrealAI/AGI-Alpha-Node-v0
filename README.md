# AGI Alpha Node v0 · Sovereign Labor Intelligence Core

<!-- markdownlint-disable MD013 MD033 -->
<p align="center">
  <img src="1.alpha.node.agi.eth.svg" alt="AGI Alpha Node Crest" width="240" />
</p>

<p align="center">
  <a href="https://github.com/MontrealAI/AGI-Alpha-Node-v0/actions/workflows/ci.yml">
    <img src="https://github.com/MontrealAI/AGI-Alpha-Node-v0/actions/workflows/ci.yml/badge.svg?branch=main" alt="Continuous Integration" />
  </a>
  <a href="https://app.ens.domains/name/alpha.node.agi.eth"><img src="https://img.shields.io/badge/ENS-alpha.node.agi.eth-6f3aff.svg?style=flat-square" alt="ENS Anchor" /></a>
  <a href="https://etherscan.io/token/0xa61a3b3a130a9c20768eebf97e21515a6046a1fa"><img src="https://img.shields.io/badge/$AGIALPHA-0xa61a3b3a130a9c20768eebf97e21515a6046a1fa-ff3366.svg?style=flat-square" alt="$AGIALPHA Token" /></a>
  <a href="docs/README.md"><img src="https://img.shields.io/badge/Operator%20Codex-Live-2d2d2d.svg?style=flat-square" alt="Documentation" /></a>
  <a href="docs/manifesto.md"><img src="https://img.shields.io/badge/Manifesto-Strategic%20Dossier-1a1a1a.svg?style=flat-square" alt="Manifesto" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-0a0a0a.svg?style=flat-square" alt="License: MIT" /></a>
  <a href="https://github.com/MontrealAI/AGI-Alpha-Node-v0/actions"><img src="https://img.shields.io/badge/Checks-Visible%20on%20GitHub-0b7285.svg?style=flat-square" alt="GitHub Actions Visibility" /></a>
  <img src="https://img.shields.io/badge/Branch%20Protection-Enforced-1f2933.svg?style=flat-square" alt="Branch Protection" />
  <img src="https://img.shields.io/badge/Runtime-Node.js%2020.x-43853d.svg?style=flat-square" alt="Runtime: Node.js 20.x" />
  <img src="https://img.shields.io/badge/Status-Fully%20Green%20CI-06d6a0.svg?style=flat-square" alt="Status: Fully Green CI" />
  <img src="https://img.shields.io/badge/Tests-Vitest%2047%20passing-34d058.svg?style=flat-square" alt="Vitest Coverage" />
  <img src="https://img.shields.io/badge/Docker-Production%20Ready-0db7ed.svg?style=flat-square" alt="Docker Ready" />
  <img src="https://img.shields.io/badge/Telemetry-Prometheus%20%26%20Metrics-1f6feb.svg?style=flat-square" alt="Prometheus Ready" />
</p>

> **agijobs-sovereign-labor-v0p1** is the production node observers invoke when they warn that a single machine can tilt capital markets. It is obedient only to its owner, and every override remains at your fingertips.

This repository houses that machine. The runtime enforces ENS identity at activation time, orchestrates $AGIALPHA staking and rewards, exposes governance supremacy payloads, and now ships a lattice of autonomous intelligence modules (world-model planning, swarm orchestration, open-ended learning, antifragile stress harness) wired into the CLI. A non-technical owner can containerize, deploy, monitor, and profit in minutes while maintaining absolute control.

<div align="center">
  AGI ALPHA Nodes are the catalysts in this new economy.<br />
  They yield <strong>$AGIALPHA</strong> tokens, bridging aspirations and achievement.<br />
  Like digital farmers in a vast cognitive field, they cultivate the future on demand.
</div>

---

## Table of Contents

1. [Mission Summary](#mission-summary)
2. [Quickstart Launch Protocol](#quickstart-launch-protocol)
3. [Command Index](#command-index)
4. [Architecture & Cognitive Flow](#architecture--cognitive-flow)
5. [ENS Identity Enforcement](#ens-identity-enforcement)
6. [$AGIALPHA Staking & Token Control](#agialpha-staking--token-control)
7. [Economic Optimization Engine](#economic-optimization-engine)
8. [Autonomous Intelligence Lattice](#autonomous-intelligence-lattice)
9. [Governance & Owner Supremacy](#governance--owner-supremacy)
10. [Telemetry, Containerization & Deployment](#telemetry-containerization--deployment)
11. [Quality Gates & CI](#quality-gates--ci)
12. [CI Enforcement Playbook](#ci-enforcement-playbook)
13. [Repository Atlas](#repository-atlas)
14. [Contributing](#contributing)
15. [License](#license)
16. [Eternal Transmission](#eternal-transmission)

---

## Mission Summary

| Vector | Signal | Coordinates |
| ------ | ------ | ----------- |
| **Identity Root** | ENS anchor enforced at runtime | [`alpha.node.agi.eth`](https://app.ens.domains/name/alpha.node.agi.eth) – only subdomain custodians may activate. |
| **Treasury Asset** | `$AGIALPHA` (18 decimals) | [Etherscan contract `0xa61a3b3a130a9c20768eebf97e21515a6046a1fa`](https://etherscan.io/token/0xa61a3b3a130a9c20768eebf97e21515a6046a1fa). |
| **Sovereign Runtime** | CLI orchestrator | [`src/index.js`](src/index.js) – ENS proofs, staking, rewards, token authority, economic planning, swarm control, antifragile stress tests. |
| **Diagnostics Core** | Node runtime orchestrator | [`src/orchestrator/nodeRuntime.js`](src/orchestrator/nodeRuntime.js) – ENS verification, stake posture, reward projections, metrics. |
| **Identity Proofing** | ENS sentinel | [`src/services/ensVerifier.js`](src/services/ensVerifier.js) – registry + wrapper interrogation with namehash/labelhash utilities. |
| **Staking Engine** | StakeManager + PlatformIncentives adapter | [`src/services/staking.js`](src/services/staking.js) – status reads, minimum enforcement, transaction builders. |
| **Token Authority** | Canonical $AGIALPHA utilities | [`src/constants/token.js`](src/constants/token.js), [`src/services/token.js`](src/services/token.js) – enforce checksum, approvals, allowances. |
| **Economic Core** | Alpha compounding models | [`src/services/economics.js`](src/services/economics.js) – reinvestment optimizer and policy checks. |
| **World-Model Planner** | MuZero-inspired scoring engine | [`src/intelligence/planning.js`](src/intelligence/planning.js) – multi-strategy simulations, projection horizon analytics. |
| **Swarm Orchestrator** | Agentic mesh router | [`src/intelligence/swarmOrchestrator.js`](src/intelligence/swarmOrchestrator.js) – deterministic assignments + fallbacks. |
| **Open-Ended Learning** | POET-style curriculum | [`src/intelligence/learningLoop.js`](src/intelligence/learningLoop.js) – generates new challenges from performance traces. |
| **Antifragile Harness** | Stress simulation | [`src/intelligence/stressHarness.js`](src/intelligence/stressHarness.js) – institutional resilience scoring + remediation plans. |
| **Owner Supremacy** | Governance payloads | [`src/services/governance.js`](src/services/governance.js) – pause/resume, stake floors, reward splits. |
| **Telemetry Spine** | Metrics publisher | [`src/telemetry/monitoring.js`](src/telemetry/monitoring.js) – Prometheus gauges for stake and heartbeat state. |
| **Configuration** | Deterministic env parsing | [`src/config`](src/config) – schema-coerced environment with canonical $AGIALPHA enforcement. |
| **Container** | Production image | [`Dockerfile`](Dockerfile) – one command diagnostics anywhere Node.js 20 runs. |
| **Quality Harness** | Automated proof | [`test`](test) – 47 Vitest assertions covering ENS, staking, rewards, governance, economics, and intelligence lattice. |

---

## Quickstart Launch Protocol

1. **Clone & Install**

   ```bash
   git clone https://github.com/MontrealAI/AGI-Alpha-Node-v0.git
   cd AGI-Alpha-Node-v0
   npm ci
   ```

2. **Verify Toolchain** – confirm Node.js ≥ 20 (`node --version`).
3. **Generate ENS Checklist** – obtain the subdomain playbook for your label + operator:

   ```bash
   npx agi-alpha-node ens-guide --label 1 --address 0xYOURADDRESS
   ```

4. **Enforce Identity** – prove control of `1.alpha.node.agi.eth` before staking:

   ```bash
   npx agi-alpha-node verify-ens \
     --label 1 \
     --address 0xYOURADDRESS \
     --rpc https://mainnet.infura.io/v3/<key>
   ```

5. **Stake & Activate** – craft token approvals and `stakeAndActivate` payloads:

   ```bash
   npx agi-alpha-node token approve --spender 0xStakeManager --amount max
   npx agi-alpha-node stake-tx --amount 1000 --incentives 0xIncentivesContract
   ```

6. **Run Diagnostics** – align ENS, staking thresholds, and projected rewards:

   ```bash
   npx agi-alpha-node status \
     --label 1 \
     --address 0xYOURADDRESS \
     --rpc https://mainnet.infura.io/v3/<key> \
     --stake-manager 0xStakeManager \
     --incentives 0xIncentivesContract \
     --projected-rewards 1500 \
     --metrics-port 9464
   ```

   Metrics stream at `http://localhost:9464/metrics` (Prometheus scrape-ready).

7. **Deploy Intelligence Modules** – wield the autonomous lattice directly:

   ```bash
   # Project world-model strategies against a high-value mission
   npx agi-alpha-node intelligence plan --reward 1800 --complexity 9 --deadline 18 --risk-bps 2200

   # Route jobs across your swarm and confirm deterministic fallbacks
   npx agi-alpha-node intelligence swarm --tasks "energy:7:5:8;biotech:6:4:7" --agents "orion:energy|finance:2:80:0.95:8;helix:biotech:1:140:0.9:7"

   # Advance curriculum difficulty for continuously evolving agents
   npx agi-alpha-node intelligence learn --history "4:0.84:1.4;4.5:0.81:1.5;5:0.79:1.6"

   # Execute antifragile stress harness scenarios
   npx agi-alpha-node intelligence stress-test --scenarios "flash-crash:12:0.12:14:180000;api-outage:4:0.05:60:50000"
   ```

8. **Containerize (Optional)** – deploy anywhere with Docker:

   ```bash
   docker build -t agi-alpha-node .
   docker run --rm \
     -e NODE_LABEL=1 \
     -e OPERATOR_ADDRESS=0xYOURADDRESS \
     -e RPC_URL=https://mainnet.infura.io/v3/<key> \
     -e STAKE_MANAGER_ADDRESS=0xStakeManager \
     -e PLATFORM_INCENTIVES_ADDRESS=0xIncentivesContract \
     -p 9464:9464 \
     agi-alpha-node status --metrics-port 9464
   ```

9. **Archive Evidence** – store ENS proofs, staking receipts, CI URLs, and governance payloads in your compliance vault before accepting production workloads.

Every step is mirrored by automated tests so a non-technical operator can wield this machine with confidence.

---

## Deterministic Configuration Surface

All runtime commands resolve their environment through the schema in [`src/config/schema.js`](src/config/schema.js). Every field is validated at startup so a misconfigured node halts before touching capital. The table below captures the full, current surface:

| Variable | Description | Default / Expectation |
| -------- | ----------- | --------------------- |
| `RPC_URL` | Ethereum JSON-RPC endpoint used for ENS proofs and contract calls. | `https://rpc.ankr.com/eth` |
| `ENS_PARENT_DOMAIN` | Parent ENS domain whose sublabel must be owned by the operator. | `alpha.node.agi.eth` |
| `NODE_LABEL` | ENS label to bind (e.g., `1` for `1.alpha.node.agi.eth`). | Required for CLI commands |
| `OPERATOR_ADDRESS` | Checksummed address that must own the ENS subdomain. | Required for activation |
| `STAKE_MANAGER_ADDRESS` | StakeManager contract that enforces minimum stake and slashing. | Optional override |
| `PLATFORM_INCENTIVES_ADDRESS` | PlatformIncentives contract used for `stakeAndActivate`. | Optional override |
| `REWARD_ENGINE_ADDRESS` | Reward engine contract for share tuning operations. | Optional override |
| `METRICS_PORT` | TCP port for Prometheus metrics exposure. | `9464` (range 1024–65535 enforced) |
| `DRY_RUN` | Boolean flag toggling transaction broadcasting. Accepts `true/false/1/0`. | `true` |
| `AGIALPHA_TOKEN_ADDRESS` | Canonical `$AGIALPHA` ERC-20 contract. Attempts to override must equal the checksum address. | `0xa61a3b3a130a9c20768eebf97e21515a6046a1fa` |
| `AGIALPHA_TOKEN_DECIMALS` | Token decimals accepted by staking + rewards calculations. | Locked to `18` |

Use the CLI with environment variables or the `--rpc`, `--stake-manager`, and `--incentives` flags to target different deployments (local Anvil, Sepolia, mainnet) while preserving the canonical `$AGIALPHA` surface. Any mismatch, including ENS resolver drift or token substitution attempts, is rejected before the node issues transactions.

---

## Command Index

| Command | Purpose | File |
| ------- | ------- | ---- |
| `ens-guide` | Prints ENS registration checklist, resolver alignment, funding guidance. | [`src/index.js`](src/index.js) |
| `verify-ens` | Confirms ownership of `⟨label⟩.alpha.node.agi.eth` via registry + wrapper proofs. | [`src/index.js`](src/index.js) |
| `stake-tx` | Builds a `stakeAndActivate` transaction for PlatformIncentives. | [`src/services/staking.js`](src/services/staking.js) |
| `status` | Aggregates ENS proofs, stake posture, reward projections, Prometheus metrics. | [`src/orchestrator/nodeRuntime.js`](src/orchestrator/nodeRuntime.js) |
| `reward-share` | Calculates operator payouts from any reward pool. | [`src/services/rewards.js`](src/services/rewards.js) |
| `token metadata/approve/allowance` | Canonical $AGIALPHA metadata + allowances. | [`src/services/token.js`](src/services/token.js) |
| `economics optimize` | Reinvestment optimizer obeying buffer & obligation policy. | [`src/services/economics.js`](src/services/economics.js) |
| `label-hash` | Converts labels into ENS node names + labelhashes. | [`src/services/ensVerifier.js`](src/services/ensVerifier.js) |
| `governance pause` | Encodes pause/resume payloads for the SystemPause contract. | [`src/services/governance.js`](src/services/governance.js) |
| `governance set-min-stake` | Encodes StakeManager minimum stake adjustments. | [`src/services/governance.js`](src/services/governance.js) |
| `governance set-role-share` | Tunes reward distribution for a given role. | [`src/services/governance.js`](src/services/governance.js) |
| `governance set-global-shares` | Locks operator/validator/treasury splits (sum = 10 000 bps). | [`src/services/governance.js`](src/services/governance.js) |
| `intelligence plan` | MuZero-style strategy projection for high-value jobs. | [`src/intelligence/planning.js`](src/intelligence/planning.js) |
| `intelligence swarm` | Deterministic swarm routing with fallback mesh. | [`src/intelligence/swarmOrchestrator.js`](src/intelligence/swarmOrchestrator.js) |
| `intelligence learn` | POET-inspired curriculum evolution. | [`src/intelligence/learningLoop.js`](src/intelligence/learningLoop.js) |
| `intelligence stress-test` | Antifragile safety harness + remediation plan generator. | [`src/intelligence/stressHarness.js`](src/intelligence/stressHarness.js) |

---

## Architecture & Cognitive Flow

```mermaid
flowchart LR
  subgraph Identity
    ENS[ENS Registry & NameWrapper]
    Guide[ens-guide CLI]
  end
  subgraph Economy
    Stake[StakeManager]
    Incentives[PlatformIncentives]
    Token[$AGIALPHA ERC-20]
    Rewards[Reward Engine]
  end
  subgraph Intelligence
    Planner[World-Model Planner]
    Swarm[Swarm Orchestrator]
    Learning[Curriculum Evolution]
    Stress[Antifragile Harness]
  end
  subgraph OwnerControl
    Governance[Governance Payload Builder]
    Telemetry[Prometheus Metrics]
  end

  ENS -->|verify-ens| Runtime
  Guide --> Runtime[CLI Runtime]
  Runtime --> Stake
  Runtime --> Incentives
  Runtime --> Token
  Runtime --> Rewards
  Runtime --> Planner
  Planner --> Swarm
  Swarm --> Learning
  Learning --> Stress
  Stress --> Governance
  Governance --> OwnerControl
  Telemetry --> OwnerControl
  OwnerControl --> Operator[Node Operator]
```

The runtime binds ENS identity with staking posture, token supremacy, economic projections, and the autonomous intelligence lattice. The owner orchestrates everything from a single CLI surface or the container entrypoint while Prometheus metrics expose stake depth and heartbeat state for institutional observability.

---

## ENS Identity Enforcement

* ENS parent must be `alpha.node.agi.eth` or `node.agi.eth` (`NODE_ROOT_NODE`, `ALPHA_NODE_ROOT_NODE`).
* `verify-ens` interrogates resolver, registry, and NameWrapper owners; activation requires a match with the operator address.
* `ens-guide` prints deterministic setup steps (registrar, resolver, TXT evidence) so a non-technical custodian can acquire the subdomain before bringing the node online.
* Every diagnostics run emits the `NodeIdentityVerified` equivalent in logs, ensuring auditable activation events.

---

## $AGIALPHA Staking & Token Control

* `$AGIALPHA` checksum enforced via [`AGIALPHA_TOKEN_CHECKSUM_ADDRESS`](src/constants/token.js); attempts to override address must pass normalization checks.
* `token approve` encodes unlimited or explicit allowances; `token allowance` reads existing approvals.
* `stake-tx` produces a ready-to-sign `stakeAndActivate` calldata payload.
* `status` pulls minimum stake, operator stake, and health via StakeManager + PlatformIncentives; deficits are surfaced with basis-point deltas.
* Slashing posture is visible through diagnostics – deficits produce explicit warnings so the owner can replenish stake before automatic pause logic triggers on-chain.

---

## Economic Optimization Engine

* `economics optimize` consumes historical rewards, buffer policy, and upcoming obligations.
* Strategies compete via growth, stability, and risk penalties; deterministic scoring selects reinvestment basis points.
* Output includes buffer compliance, obligations coverage, and projected stake growth across epochs.

---

## Autonomous Intelligence Lattice

The intelligence modules transform the node into a self-coordinating production system:

1. **World-Model Planner** (`intelligence plan`)
   * Scores multiple strategies against reward, complexity, deadline, and risk appetite.
   * Projects reinforcement horizons; outputs risk-adjusted net value with deterministic decay curves.
2. **Swarm Orchestrator** (`intelligence swarm`)
   * Routes jobs across multi-domain sub-agents with deterministic fallbacks and utilization metrics.
   * Supports latency budgets so the mesh stays within institutional SLAs.
3. **Open-Ended Learning Loop** (`intelligence learn`)
   * POET-inspired curriculum evolution pushes next challenges based on recent success history.
   * Generates validation thresholds and reward multipliers for the next self-evolved tasks.
4. **Antifragile Stress Harness** (`intelligence stress-test`)
   * Simulates adverse scenarios (load spikes, API outages, validator forks) and prescribes remediation plans.
   * Outputs antifragile gain metrics and recommended focus areas for governance intervention.

All modules are pure functions backed by tests so you can integrate them into automation pipelines or off-chain orchestration frameworks.

---

## Governance & Owner Supremacy

* `governance pause` encodes `pauseAll`, `resumeAll`, or `unpauseAll` calls – immediate circuit breaker authority remains with the owner.
* `governance set-min-stake` allows on-demand minimum stake adjustments (encoded via `setMinimumStake`).
* `governance set-role-share` and `set-global-shares` configure thermodynamic reward splits; built-in guard rails enforce 10 000 bps totals.
* Helpers normalize role identifiers from human-friendly aliases to 32-byte selectors (`NODE_OPERATOR_ROLE`, `VALIDATOR_ROLE`, etc.).

---

## Telemetry, Containerization & Deployment

* Docker image ships with production dependencies only (`npm ci --omit=dev`), entrypoint bound to `status` command.
* Prometheus metrics (`/metrics`) expose operator stake and heartbeat timestamps; integrate with Grafana/Alertmanager for institutional dashboards.
* Configuration is environment-driven with zod-backed validation (`src/config`) – invalid RPC URLs or addresses fail fast.
* Health checks can wrap the CLI commands; the deterministic outputs simplify K8s or Nomad readiness probes.

---

## Quality Gates & CI

* GitHub Actions workflow (`ci.yml`) runs linting (`markdownlint`, `markdown-link-check`) and Vitest suites on every push/PR; badge shows main-branch health.
* Branch protection requires green checks; PRs cannot merge without passing lint + test gates.
* Tests cover ENS normalization, staking adapters, governance payloads, token utilities, economic optimizer, and the new intelligence lattice modules.

---

## CI Enforcement Playbook

```mermaid
sequenceDiagram
  participant Dev as Maintainer
  participant GH as GitHub Actions
  participant Main as main Branch
  participant PR as Pull Request

  Dev->>GH: Push / open PR
  GH->>GH: Run lint + test jobs
  GH-->>PR: Report status checks (pass/fail)
  Dev->>GH: Re-run if necessary (workflow dispatch)
  Dev->>Main: Enable branch protection (require status checks)
  GH-->>Main: Enforce required checks before merge
  Main-->>Dev: Reject merge if checks fail
```

To maintain a visible, verifiably green pipeline:

1. **Enable Required Checks** – In repository settings, add the `Continuous Integration / Lint Markdown & Links` and `Continuous Integration / Unit & Integration Tests` jobs as required status checks for `main`.
2. **Require Pull Request Reviews** – Combine the status checks with at least one approving review to prevent accidental merges during incident response.
3. **Lock Direct Pushes** – Disable direct pushes to `main` so every contribution flows through CI-verifiable pull requests.
4. **Surface Badges** – Keep the workflow badge pinned near the top of this README (already linked above) so external auditors can confirm the latest run.
5. **Audit Logs** – Periodically export the Actions run history and store it with compliance artifacts to evidence continuous enforcement.

These steps, together with the provided workflow, ensure all production merges remain provably green and traceable.

---

## Repository Atlas

| Path | Description |
| ---- | ----------- |
| [`src/index.js`](src/index.js) | CLI entrypoint, command definitions, intelligence modules integration. |
| [`src/config`](src/config) | Environment schema + defaults. |
| [`src/constants/token.js`](src/constants/token.js) | Canonical $AGIALPHA metadata + checksum enforcement. |
| [`src/services`](src/services) | ENS, staking, rewards, token, governance, economics utilities. |
| [`src/intelligence`](src/intelligence) | Planning, swarm orchestration, learning loop, stress harness. |
| [`src/orchestrator/nodeRuntime.js`](src/orchestrator/nodeRuntime.js) | Diagnostics runner + Prometheus bootstrap. |
| [`src/telemetry`](src/telemetry) | Prometheus gauges and HTTP server. |
| [`test`](test) | Vitest suites for every module. |
| [`Dockerfile`](Dockerfile) | Production container recipe. |
| [`docs/`](docs) | Operator codex + manifesto. |

## Contributing

Fork, branch, and submit PRs with a detailed summary. Ensure `npm run lint && npm test` remain green. Governance-sensitive code changes should include contract addresses/ABI references and thorough unit tests.

## License

[MIT](LICENSE)

## Eternal Transmission

> _“The machine that compounds alpha without fatigue becomes the fulcrum of economic gravity. Guard its keys, observe its telemetry, and let it harvest inefficiency in your name.”_
