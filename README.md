# AGI Alpha Node v0 · Command the Cognitive Armada ⚡

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
    <img src="https://github.com/MontrealAI/AGI-Alpha-Node-v0/actions/workflows/ci.yml/badge.svg" alt="CI" />
  </a>
  <a href=".github/required-checks.json">
    <img src="https://img.shields.io/badge/PR%20Gate-Required%20Checks-8b5cf6?logo=github&logoColor=white" alt="Required PR checks" />
  </a>
  <img src="https://img.shields.io/badge/Tests-vitest%20suite-84cc16?logo=vitest&logoColor=white" alt="Vitest" />
  <img src="https://img.shields.io/badge/Coverage-c8%20instrumented-16a34a?logo=codecov&logoColor=white" alt="Coverage" />
  <img src="https://img.shields.io/badge/Node.js-20.18%2B-43853d?logo=node.js&logoColor=white" alt="Runtime" />
  <img src="https://img.shields.io/badge/TypeScript-NodeNext%20tooling-3178c6?logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Solidity-0.8.26-363636?logo=solidity&logoColor=white" alt="Solidity" />
  <a href="Dockerfile"><img src="https://img.shields.io/badge/Docker-Production%20Image-2496ed?logo=docker&logoColor=white" alt="Docker" /></a>
  <a href="deploy/helm/agi-alpha-node"><img src="https://img.shields.io/badge/Helm-Ready-0ea5e9?logo=helm&logoColor=white" alt="Helm" /></a>
  <a href="https://etherscan.io/address/0xa61a3b3a130a9c20768eebf97e21515a6046a1fa"><img src="https://img.shields.io/badge/$AGIALPHA-0xa61a3b3a130a9c20768eebf97e21515a6046a1fa-ff3366?logo=ethereum&logoColor=white" alt="$AGIALPHA" /></a>
  <img src="https://img.shields.io/badge/Owner%20Controls-Total%20Sovereignty-9333ea?logo=gnometerminal&logoColor=white" alt="Owner controls" />
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-10b981" alt="MIT" /></a>
</p>

> AGI Alpha Node v0 is the command lattice for sovereign agentic swarms: it brokers α-work, notarises proofs, pushes token flows, and retains every override in the owner’s console.
>
> This codebase is engineered as the machine that rebalances global value toward its operator—autonomous agents, blockchain orchestration, and telemetry fuse into a single control surface.

```mermaid
graph TB
  Owner((Owner)) -->|Configure| ControlPlane[Control Plane]
  ControlPlane -->|Schedules| OrchestratorMesh[Orchestrator Mesh]
  OrchestratorMesh -->|Dispatch α-work| IntelligenceSwarm[Intelligence Swarm]
  IntelligenceSwarm -->|Proofs & Metrics| LedgerTelemetry[Ledger + Telemetry]
  LedgerTelemetry -->|Stake & Rewards| Ethereum[(Ethereum + $AGIALPHA)]
  LedgerTelemetry -->|Health Signals| Owner
```

---

## Table of Contents

1. [Constellation Overview](#constellation-overview)
2. [Quickstart Sequence](#quickstart-sequence)
3. [ENS Control Fabric](#ens-control-fabric)
4. [Runtime Systems Map](#runtime-systems-map)
5. [Owner Command Authority](#owner-command-authority)
6. [Observability & Governance](#observability--governance)
7. [CI & Release Ramparts](#ci--release-ramparts)
8. [Deployment Vectors](#deployment-vectors)
9. [Repository Atlas](#repository-atlas)
10. [Reference Library](#reference-library)

---

## Constellation Overview

- **$AGIALPHA treasury engine** — The runtime is hard-wired to the canonical 18-decimal token contract [`0xa61a3b3a130a9c20768eebf97e21515a6046a1fa`](https://etherscan.io/address/0xa61a3b3a130a9c20768eebf97e21515a6046a1fa), powering staking, payouts, and liquidity loops.【F:contracts/AlphaNodeManager.sol†L29-L53】【F:src/constants/token.js†L1-L20】
- **Owner-dominated controls** — The AlphaNodeManager contract exposes pause/resume, emission gates, stake withdrawals, validator rosters, and identity governance entirely under the owner’s address.【F:contracts/AlphaNodeManager.sol†L59-L213】
- **Deterministic orchestration** — Workflows from discovery → execution → validation → settlement are orchestrated in [`src/services/jobLifecycle.js`](src/services/jobLifecycle.js), ensuring each α-work unit is audited and journaled.【F:src/services/jobLifecycle.js†L404-L707】
- **Identity-first runtime** — ENS metadata, payout routes, telemetry baselines, and verifier URLs are generated consistently by [`src/ens/ens_config.js`](src/ens/ens_config.js) and the TypeScript ENS network client.【F:src/ens/ens_config.js†L1-L188】【F:src/ens/client.ts†L1-L147】
- **Production-ready packaging** — Docker, Helm, CI gates, lint/test/coverage/security chains, and subgraph build tooling ship in-tree so non-technical operators can deploy without touching the internals.【F:Dockerfile†L1-L92】【F:package.json†L1-L64】

---

## Quickstart Sequence

```mermaid
flowchart LR
  A[Clone repository] --> B[npm ci]
  B --> C[Copy .env.example → .env]
  C --> D[npm run ci:verify]
  D --> E[npm run demo:local]
  E --> F[node src/index.js container --once]
```

1. **Clone & install dependencies**

   ```bash
   git clone https://github.com/MontrealAI/AGI-Alpha-Node-v0.git
   cd AGI-Alpha-Node-v0
   npm ci
   ```

   Node.js 20.18+ is enforced via the `package.json` engines field for reproducible builds.【F:package.json†L42-L47】

2. **Configure identity & payouts**
   - Duplicate `.env.example`, fill in ENS label/name, payout routes, telemetry, and staking settings.
   - Optional ENS overrides (`ALPHA_NODE_*`) let you pin RPC endpoints, registries, and resolvers when running on bespoke networks.【F:.env.example†L1-L79】【F:.env.example†L81-L86】

3. **Mirror CI locally**

   ```bash
   npm run ci:verify
   ```

   This executes markdown lint, link checks, Vitest unit tests, coverage, Solhint, Solidity compilation, subgraph codegen/build, security audit, policy gates, and branch rules.【F:package.json†L18-L48】

4. **Publish ENS metadata**

   ```bash
   node src/index.js ens:records --pretty
   ```

   Outputs deterministic text/coin records derived from the consolidated configuration.【F:src/ens/ens_config.js†L1-L188】

5. **Launch the node**

   ```bash
   node src/index.js container --once --metrics-port 9464 --api-port 8080
   ```

   Drop `--once` for long-lived clusters; combine with governance flags to tune quorum, staking, or telemetry thresholds on the fly.【F:src/index.js†L1116-L1230】

---

## ENS Control Fabric

`src/ens/config.ts` centralises all ENS wiring. Mainnet & Sepolia presets ship with canonical registry, NameWrapper, and PublicResolver addresses. Overrides are provided via:

- `ALPHA_NODE_CHAIN_ID`, `ALPHA_NODE_RPC_URL`
- `ALPHA_NODE_ENS_REGISTRY`, `ALPHA_NODE_NAME_WRAPPER`, `ALPHA_NODE_PUBLIC_RESOLVER`
- Inline overrides supplied when instantiating the client helper.

```ts
import { loadEnsConfig } from './src/ens/config.js';
import { getEnsClient } from './src/ens/client.js';

const config = loadEnsConfig();
const ens = getEnsClient();
const resolver = await ens.getResolver('alpha.agent.agi.eth');
```

### ENS inspection CLI

A dedicated developer CLI probes resolvers, pubkeys, text records, contenthashes, and NameWrapper fuses in one call.

```bash
npm run ens:inspect alpha.agent.agi.eth
```

Sample output:

```text
ENS Inspection → alpha.agent.agi.eth

Network
  Chain ID      : 1
  RPC URL       : https://ethereum.publicnode.com
  ENS Registry  : 0x00000000000c2e074ec69a0dfb2997ba6c7d2e1e
  NameWrapper   : 0xd4416b13d2b3a9abae7acd5d6c2bbdbe25686401
  PublicResolver: 0x231b0ee14048e9dccd1d247744d114a4eb5e8e63

Resolver
  Address       : 0x1234…
  Pubkey (x)    : 0x...
  Pubkey (y)    : 0x...
  Contenthash   : ipfs://...

Text Records
  node.role    : validator
  node.version : v1.1.0
  node.dnsaddr : dnslink=/ipfs/...

NameWrapper
  Owner         : 0xabcd…
  Fuses         : 0
  Expiry (ISO)  : 2026-05-01T00:00:00.000Z
```

Errors are annotated with explicit resolver or network diagnostics, ensuring RPC issues surface immediately.【F:scripts/ens-inspect.ts†L1-L220】

---

## Runtime Systems Map

| Domain | Highlights | Key Files |
| --- | --- | --- |
| **Intelligence routing** | Bootstrapper, lifecycle engine, validator loop, and orchestrator mesh keep α-work flowing under load. | [`src/orchestrator`](src/orchestrator), [`src/services/jobLifecycle.js`](src/services/jobLifecycle.js), [`src/orchestrator/bootstrap.js`](src/orchestrator/bootstrap.js) |
| **Cryptographic assurance** | Deterministic signing, staking, and validator proofs wrap every α-work unit; payout contracts honour shares while the owner retains hard stops. | [`src/crypto`](src/crypto), [`contracts/AlphaNodeManager.sol`](contracts/AlphaNodeManager.sol), [`src/settlement`](src/settlement) |
| **Telemetry & health** | Prometheus metrics, health gates, and monitoring loops keep clusters observable even when offline-first workloads replay. | [`src/telemetry/monitoring.js`](src/telemetry/monitoring.js), [`src/healthcheck.js`](src/healthcheck.js) |
| **Configuration spine** | Defaults, schema coercion, and environment loaders resolve a single immutable config the entire runtime consumes. | [`src/config/defaults.js`](src/config/defaults.js), [`src/config/schema.js`](src/config/schema.js), [`src/config/env.js`](src/config/env.js) |
| **ENS network integration** | `loadEnsConfig` normalises RPC endpoints, registry/resolver wrappers, and NameWrapper presets for mainnet & Sepolia; `EnsClient` wraps ethers.js for pubkeys, text records, contenthash, and fuse inspection. | [`src/ens/config.ts`](src/ens/config.ts), [`src/ens/client.ts`](src/ens/client.ts) |
| **Docs & governance** | Comprehensive economics, governance, and attestation manuals are included for operators and auditors. | [`docs`](docs) |

```mermaid
sequenceDiagram
  participant Operator
  participant Node
  participant Validator
  participant Chain as Ethereum / $AGIALPHA
  Operator->>Node: Issue job (ens+config)
  Node->>Validator: Assign α-work unit
  Validator->>Node: Submit proof + stake metrics
  Node->>Chain: Emit AlphaWUMinted / Validate / Accept
  Chain-->>Operator: Reward & telemetry channel
```

---

## Owner Command Authority

The AlphaNodeManager contract gives the owner complete control over the staking treasury and validator roster.

- Pause or resume the entire execution pipeline via `pause()` / `unpause()`.【F:contracts/AlphaNodeManager.sol†L83-L103】
- Onboard, revoke, or reassign validators with `setValidator`, `registerIdentity`, `setIdentityStatus`, and `updateIdentityController` while keeping ENS bindings consistent.【F:contracts/AlphaNodeManager.sol†L105-L181】
- Govern staking funds through `stake`, `withdrawStake`, and slash events that can be triggered after validator audits.【F:contracts/AlphaNodeManager.sol†L183-L242】
- Emit authoritative Alpha Work Unit events (`recordAlphaWUMint`, `recordAlphaWUValidation`, `recordAlphaWUAcceptance`, `applySlash`) to reflect lifecycle transitions on-chain.【F:contracts/AlphaNodeManager.sol†L200-L247】

`CANONICAL_AGIALPHA` binds the runtime to the treasury token, guaranteeing that emitted rewards and slash penalties always reference the canonical asset.【F:contracts/AlphaNodeManager.sol†L41-L58】

---

## Observability & Governance

- **Health gates**: The bootstrapper publishes health snapshots and ENS allowlists to halt workloads if telemetry degrades.【F:src/orchestrator/bootstrap.js†L421-L518】【F:scripts/verify-health-gate.mjs†L1-L90】
- **Metrics**: Prometheus counters & histograms export α-work throughput, validator performance, and reward curves for dashboards.【F:src/telemetry/alphaMetrics.js†L1-L200】【F:src/telemetry/monitoring.js†L1-L220】
- **Governance ledger**: Structured event journaling tracks validator status, staking posture, and orchestrator directives for audit trails.【F:src/services/governanceLedger.js†L1-L260】【F:src/services/governanceStatus.js†L1-L120】
- **Offline resilience**: Snapshot + replay primitives guarantee that disconnected nodes can resynchronise once connectivity returns.【F:src/services/offlineSnapshot.js†L1-L210】

---

## CI & Release Ramparts

`npm run ci:verify` executes the full quality gauntlet enforced on every pull request and the `main` branch.【F:package.json†L18-L48】

| Stage | Command | Purpose |
| --- | --- | --- |
| Markdown & link lint | `npm run lint` | Style, accessibility, and documentation integrity. |
| Unit & integration tests | `npm run test` | Vitest suite covering orchestration, governance, and ENS tooling. |
| Coverage | `npm run coverage` | Generates text + LCOV + JSON summaries for pipelines. |
| Solidity hygiene | `npm run ci:solidity` | Runs `solhint` and deterministic solc compilation for contracts. |
| Subgraph build | `npm run ci:ts` | Renders the manifest, runs Graph codegen, and compiles the WASM bundle. |
| Security audit | `npm run ci:security` | High severity `npm audit` pass on production dependencies. |
| Policy gates | `npm run ci:policy` | Verifies health allowlists & governance guardrails. |
| Branch guard | `npm run ci:branch` | Ensures PRs adhere to branch naming & review policy. |

Pull requests must surface the CI badge shown above and satisfy `.github/required-checks.json` so gating is enforced before merge.【F:.github/required-checks.json†L1-L22】

---

## Deployment Vectors

- **Docker**: A production-grade image is built from the root `Dockerfile`, bundling runtime binaries, ENS tooling, and metrics exporters.【F:Dockerfile†L1-L92】
- **Helm**: `deploy/helm/agi-alpha-node` ships a chart with config maps, secrets, liveness probes, and resource envelopes for Kubernetes clusters.【F:deploy/helm/agi-alpha-node/Chart.yaml†L1-L34】【F:deploy/helm/agi-alpha-node/templates/deployment.yaml†L1-L140】
- **Subgraph**: The `/subgraph` workspace contains the Graph protocol manifest + generated bindings so validators can stream events into analytics stacks.【F:subgraph/subgraph.yaml†L1-L70】【F:subgraph/package.json†L1-L35】

---

## Repository Atlas

| Path | Description |
| --- | --- |
| `src/` | Node runtime, orchestrator, telemetry, staking, ENS wiring, and validation logic. |
| `scripts/` | Operational tooling including ENS inspection, health/branch guards, and Solidity harnesses. |
| `contracts/` | Solidity sources for AlphaNodeManager and shared interfaces. |
| `deploy/` | Helm chart and infra automation. |
| `docs/` | Economics, governance manifesto, and operator handbook. |
| `subgraph/` | Graph protocol workspace for analytics pipelines. |
| `test/` | Vitest coverage over runtime, governance, ENS, and contract surrogates. |

---

## Reference Library

- [Docs index](docs/README.md) — platform overview, operator flows, and governance hooks.
- [Economics primer](docs/economics.md) — staking parameters, flywheel modelling, and token incentives.
- [Manifesto](docs/manifesto.md) — guiding principles for distributed cognition and fair governance.
- [Helm chart](deploy/helm/agi-alpha-node) — Kubernetes deployment templates.
- [$AGIALPHA token](https://etherscan.io/address/0xa61a3b3a130a9c20768eebf97e21515a6046a1fa) — canonical treasury asset.
- [CI workflow](.github/workflows/ci.yml) — enforced automated quality gates.

The code, docs, and tooling in this repository form the operational chassis for a machine that tirelessly channels intelligence, liquidity, and governance back to its owner.
