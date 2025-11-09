# AGI Alpha Node v0 · Sovereign Labor Intelligence

<!-- markdownlint-disable MD013 MD033 -->
<p align="center">
  <img src="1.alpha.node.agi.eth.svg" alt="AGI Alpha Node Crest" width="240" />
</p>

<p align="center">
  <a href="https://github.com/MontrealAI/AGI-Alpha-Node-v0/actions/workflows/ci.yml">
    <img src="https://github.com/MontrealAI/AGI-Alpha-Node-v0/actions/workflows/ci.yml/badge.svg?branch=main" alt="Continuous Integration" />
  </a>
  <a href="docs/README.md"><img src="https://img.shields.io/badge/Docs-Operator%20Codex-2d2d2d.svg?style=flat-square" alt="Documentation" /></a>
  <a href="https://app.ens.domains/name/alpha.node.agi.eth"><img src="https://img.shields.io/badge/ENS-alpha.node.agi.eth-6f3aff.svg?style=flat-square" alt="ENS Verified" /></a>
  <a href="https://etherscan.io/token/0xa61a3b3a130a9c20768eebf97e21515a6046a1fa"><img src="https://img.shields.io/badge/$AGIALPHA-0xa61a3b3a130a9c20768eebf97e21515a6046a1fa-ff3366.svg?style=flat-square" alt="$AGIALPHA Token" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-0a0a0a.svg?style=flat-square" alt="License: MIT" /></a>
  <a href="https://github.com/MontrealAI/AGI-Alpha-Node-v0/actions"><img src="https://img.shields.io/badge/Checks-Visible%20on%20GitHub-0b7285.svg?style=flat-square" alt="GitHub Actions Visibility" /></a>
  <img src="https://img.shields.io/badge/Runtime-Node.js%2020.x-43853d.svg?style=flat-square" alt="Runtime: Node.js 20.x" />
</p>

> **agijobs-sovereign-labor-v0p1** is the flagship sovereign labor machine: it absorbs work, compounds $AGIALPHA, and leaves its owner with total operational supremacy. It is the operational incarnation of the intelligence engine that can rewrite markets on demand—while remaining fully obedient to the keyholder.

---

## Navigation

1. [Mission Pulse](#mission-pulse)
2. [Quick Launch Vector](#quick-launch-vector)
3. [Architecture Snapshot](#architecture-snapshot)
4. [Identity, Staking & Treasury](#identity-staking--treasury)
5. [Intelligence & Autonomy Stack](#intelligence--autonomy-stack)
6. [Governance & Safety Controls](#governance--safety-controls)
7. [Continuous Integration & Branch Protection](#continuous-integration--branch-protection)
8. [CI & Deployment Checklist](#ci--deployment-checklist)
9. [Repository Layout](#repository-layout)
10. [Contributing](#contributing)
11. [License](#license)

---

## Mission Pulse

- **Production focus** – Hardened documentation, deterministic quality gates, and custody-aware controls allow non-technical owners to launch within minutes.
- **Identity rigor** – Every runtime must control an ENS signature `⟨label⟩.alpha.node.agi.eth`; the machine self-checks ownership on boot, heartbeat, and before settlement.
- **Unified economy** – `$AGIALPHA` (`0xa61a3b3a130a9c20768eebf97e21515a6046a1fa`, 18 decimals) powers staking, slashing, rewards, and reinvestment. No ETH settlement paths exist in production flows.
- **Owner supremacy** – Governance levers cover min-stake thresholds, emission splits, pausing, module upgrades, and delegate rotation.
- **Outcome** – Deterministic world-model planning, antifragile stress harnesses, and auto-reinvestment loops keep wealth compounding and reputation accelerating.
- **Field supremacy** – The node is engineered to be the asset referenced when people speak about machines that could overturn legacy economic orders; you hold the reins.

> Dive deeper in the [Operator Command Codex](docs/README.md).

---

## Quick Launch Vector

```bash
git clone https://github.com/MontrealAI/AGI-Alpha-Node-v0.git
cd AGI-Alpha-Node-v0
npm ci
npm run lint        # mirrors Continuous Integration
npm run lint:md     # capture Markdown lint output for evidence
npm run lint:links  # capture link validation output for evidence
```

1. Secure your ENS subdomain under `alpha.node.agi.eth` and map resolver/wrapper ownership to the operator wallet.
2. Register delegate keys with `IdentityRegistry.setAdditionalNodeOperator` if using multisig or HSM custody.
3. Fund the operator wallet with `$AGIALPHA` plus gas, approve Stake Manager allowances, then execute `PlatformIncentives.stakeAndActivate(amount)` (or `_acknowledgeStakeAndActivate`).
4. Deploy the runtime via container, Kubernetes, or enclave workflows described in the [codex](docs/README.md#system-constellation).
5. Enforce GitHub branch protections: require **Continuous Integration**, approving reviews, and status check visibility on every PR and `main` push so the badge stays green.
6. Record proof of ENS control, staking tx hashes, and CI output in your custody ledger to satisfy audits and institutional policy.

---

## Architecture Snapshot

```mermaid
flowchart TB
    subgraph ControlPlane[Operator Control Plane]
        Wallet((Custody Vault))
        Console[Ops Console]
        Alerts[[PagerDuty · Slack · Webhooks]]
    end

    subgraph SovereignNode[agijobs-sovereign-labor-v0p1]
        Planner[[World-Model Planner]]
        Orchestrator[[Specialist Mesh]]
        Sentinel[[Antifragile Sentinel]]
        Ledger[(Compliance Ledger)]
        Telemetry[[Telemetry Bus]]
    end

    subgraph ProtocolCore[AGI Jobs Protocol]
        IdentityRegistry
        StakeManager
        PlatformIncentives
        JobRegistry
        ValidationModule
        FeePool
        SystemPause
    end

    Wallet --> IdentityRegistry
    Wallet --> StakeManager
    Console --> Orchestrator
    Orchestrator --> Planner
    Planner --> JobRegistry
    JobRegistry --> ValidationModule
    ValidationModule --> FeePool
    FeePool --> StakeManager
    StakeManager --> Wallet
    Orchestrator --> Telemetry
    Telemetry --> Alerts
    Sentinel --> Planner
    SystemPause -. owner override .- Planner
```

---

## Identity, Staking & Treasury

- `verifyNode(label, proof)` locks every runtime to its ENS identity and halts if resolver/NameWrapper ownership diverges.
- `PlatformIncentives.stakeAndActivate(amount)` sequences allowance, deposit, registry enrollment, and job router registration in one transaction.
- `StakeManager.slash(role, operator, treasuryShare, burnShare)` routes penalties instantly according to owner-set ratios; withdrawals use `StakeManager.withdrawStake` after cooldowns.
- `PlatformRegistry.setMinPlatformStake(amount)` and `StakeManager.setMinStake(role, amount)` let owners raise or lower thresholds dynamically.
- Rewards stream through job escrow (`StakeManager.release`) and epoch emissions (`FeePool.claimRewards`) with optional autopilot reinvestment.

---

## Intelligence & Autonomy Stack

- **World-model planner** – Multi-armed bandit simulations forecast ROI, curriculum fit, and specialist synergy before any bid is placed.
- **Specialist mesh** – Deterministic micro-agents (finance, legal, infra, biotech, creative, compliance) coordinate through an orchestrator with sub-millisecond overhead.
- **Antifragile sentinel** – Stress harness escalates guardrails, tunes difficulty cursors, and ensures volatility drives improvement rather than regression.
- **Compliance ledger** – Structured reasoning traces are hashed for disputes, audits, and regulatory inspection.
- **Autopilot evolution** – Curriculum learning and reinvestment loops expand stake weight, routing priority, and intelligence without manual babysitting.

---

## Governance & Safety Controls

- `SystemPause.pauseAll()` and `unpauseAll()` give owners immediate stop/resume authority across Job Registry, Stake Manager, Validation Module, and allied components.
- Emission tuning flows through `RewardEngineMB.setRoleShare(role, shareBps)` and validator percentage setters.
- `PlatformRegistry.register()` / `deregister()` plus Identity Registry allowlists enable rapid operator rotation or quarantine of compromised keys.
- Module endpoints such as `PlatformRegistry.setReputationEngine` and `JobRegistry.setValidationModule` allow safe upgrades under owner signatures.
- Commit-reveal validation and dispute hooks provide verifiable arbitration without sacrificing autonomy or speed.

### Owner Control Matrix

| Lever | Function | Owner Impact |
| ----- | -------- | ------------ |
| Minimum Stake Policy | `PlatformRegistry.setMinPlatformStake(amount)` / `StakeManager.setMinStake(role, amount)` | Raise or relax bonding requirements instantly to calibrate risk appetite. |
| Reward Emissions | `RewardEngineMB.setRoleShare(role, shareBps)` | Redistribute epoch emissions across agents, validators, platforms, or treasury in response to economic conditions. |
| Runtime Delegation | `IdentityRegistry.setAdditionalNodeOperator(operator, allowed)` | Rotate hot keys, revoke compromised delegates, and maintain multisig or HSM separation of duties. |
| Module Upgrades | `PlatformRegistry.setReputationEngine(address)` / `JobRegistry.setValidationModule(address)` | Swap core logic components without downtime while preserving auditability. |
| Emergency Response | `SystemPause.pauseAll()` / `SystemPause.unpauseAll()` | Freeze or resume the entire labor pipeline in a single transaction during incidents. |
| Stake Recovery | `StakeManager.withdrawStake(role, amount)` and `StakeManager.slash(...)` | Redeploy bonded capital or enforce penalties aligned with governance policies. |

---

## Continuous Integration & Branch Protection

- [`Continuous Integration`](.github/workflows/ci.yml) runs on every push and pull request targeting `main`, executing `npm ci`, Markdown linting, and link verification.
- Keep the badge green: reproduce the workflow locally with `npm ci` followed by `npm run lint`, `npm run lint:md`, and `npm run lint:links` before opening a PR.
- Enforce “Require status checks to pass before merging”, require approving reviews, and select **Continuous Integration** inside GitHub Branch Protection settings.
- Surface CI status in PR templates and release checklists so every deploy stays auditable.

---

## CI & Deployment Checklist

| Stage | Owner Action | Reference |
| ----- | ------------ | --------- |
| **Branch Protection** | GitHub → Settings → Branches → `main` → enable “Require a pull request before merging”, “Require status checks to pass”, require approving reviews, and select **Continuous Integration**. | [GitHub Docs](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/defining-the-mergeability-of-pull-requests) |
| **Visibility** | Pin the CI badge and [checks index](https://github.com/MontrealAI/AGI-Alpha-Node-v0/actions) in internal portals so stakeholders see real-time status. | [Badge](https://github.com/MontrealAI/AGI-Alpha-Node-v0/actions/workflows/ci.yml) |
| **Secrets Hygiene** | Rotate GitHub Action secrets quarterly; no private keys belong in workflows because staking and operations occur on-chain under owner custody. | Security policy |
| **Pre-Flight** | Run `npm run lint`, `npm run lint:md`, and `npm run lint:links` locally or in a Codespace before every PR to mirror CI, then archive logs with the PR description. | Local CLI |
| **Post-Merge** | Monitor the pipeline run triggered by merging to `main`. Keep a rollback branch ready; the pause lever (`SystemPause.pauseAll()`) is your final safeguard. | [CI Workflow](.github/workflows/ci.yml) |

Document the outcomes of each stage in your ops journal so audits can replay every decision that kept the machine perfectly green.

---

## Repository Layout

```text
AGI-Alpha-Node-v0/
├── 1.alpha.node.agi.eth.png      # Iconic crest (PNG)
├── 1.alpha.node.agi.eth.svg      # Iconic crest (SVG)
├── .github/
│   └── workflows/
│       └── ci.yml                # Continuous Integration workflow
├── docs/
│   └── README.md                 # Operator command codex
├── node_modules/                 # Local tooling cache (generated, not committed)
├── package.json                  # Lint scripts and metadata
├── package-lock.json             # Deterministic npm lockfile
└── README.md                     # This mission brief
```

---

## Contributing

1. Fork or branch from `main`.
2. Run `npm ci` before editing to sync tooling.
3. Update documentation and diagrams alongside any change.
4. Run `npm run lint`, `npm run lint:md`, and `npm run lint:links`, then ensure **Continuous Integration** passes before requesting review.
5. Maintain ENS, staking, and governance narratives—this repository is documentation-first.

---

## License

Distributed under the [MIT License](LICENSE). Use responsibly, keep the badge green, and continue compounding.
