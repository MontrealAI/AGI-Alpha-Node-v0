# AGI Alpha Node v0 · Command the Cognitive Armada ⚡

<!-- markdownlint-disable MD013 MD033 -->
<p align="center">
  <picture>
    <source srcset="1.alpha.node.agi.eth.svg" type="image/svg+xml" />
    <img src="1.alpha.node.agi.eth.png" alt="AGI Alpha Node Insignia" width="256" loading="lazy" decoding="async" />
  </picture>
</p>

<p align="center">
  <a href="https://github.com/MontrealAI/AGI-Alpha-Node-v0/actions/workflows/ci.yml">
    <img src="https://github.com/MontrealAI/AGI-Alpha-Node-v0/actions/workflows/ci.yml/badge.svg?branch=main" alt="CI" />
  </a>
  <a href=".github/required-checks.json">
    <img src="https://img.shields.io/badge/PR%20Gate-Required%20Checks-8b5cf6?logo=github&logoColor=white" alt="Required PR checks" />
  </a>
  <img src="https://img.shields.io/badge/Tests-Vitest%20249%E2%9C%94-84cc16?logo=vitest&logoColor=white" alt="Vitest" />
  <img src="https://img.shields.io/badge/Runtime-Node.js%2020.18%2B-43853d?logo=node.js&logoColor=white" alt="Runtime" />
  <img src="https://img.shields.io/badge/Solidity-0.8.26-363636?logo=solidity&logoColor=white" alt="Solidity" />
  <a href="https://etherscan.io/address/0xa61a3b3a130a9c20768eebf97e21515a6046a1fa"><img src="https://img.shields.io/badge/$AGIALPHA-0xa61a3b3a130a9c20768eebf97e21515a6046a1fa-ff3366?logo=ethereum&logoColor=white" alt="$AGIALPHA" /></a>
  <img src="https://img.shields.io/badge/Owner%20Controls-Total%20Command-9333ea?logo=gnometerminal&logoColor=white" alt="Owner controls" />
  <a href="Dockerfile"><img src="https://img.shields.io/badge/Docker-Ready-2496ed?logo=docker&logoColor=white" alt="Docker" /></a>
  <a href="deploy/helm/agi-alpha-node"><img src="https://img.shields.io/badge/Helm-Chart-0ea5e9?logo=helm&logoColor=white" alt="Helm" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-10b981" alt="MIT" /></a>
</p>

> **AGI Alpha Node v0 metabolizes cognition into $AGIALPHA with owner-grade sovereignty.** It aligns ENS, staking, telemetry, and health attestation so every packet, proof, and payout stays bound to the operator’s authority.

```mermaid
graph LR
  Owner((Owner)) -->|Directives| ControlPlane[Control Plane]
  ControlPlane -->|Schedules| OrchestratorMesh[Orchestrator Mesh]
  OrchestratorMesh -->|Dispatch α-work| IntelligenceSwarm[Intelligence Swarm]
  IntelligenceSwarm -->|Proofs & Metrics| LedgerTelemetry[Ledger + Telemetry]
  LedgerTelemetry -->|Stake & Rewards| Ethereum[(Ethereum + $AGIALPHA)]
  LedgerTelemetry -->|Health Signals| Owner
```

---

## Table of Contents

1. [Mission Snapshot](#mission-snapshot)
2. [Quickstart](#quickstart)
3. [Health Attestation Mesh](#health-attestation-mesh)
4. [$AGIALPHA Treasury & Owner Authority](#agialpha-treasury--owner-authority)
5. [ENS-Aligned Identity Fabric](#ens-aligned-identity-fabric)
6. [Autonomous Job Orchestration](#autonomous-job-orchestration)
7. [Observability Stack](#observability-stack)
8. [Testing & CI Gates](#testing--ci-gates)
9. [Deployment Vectors](#deployment-vectors)
10. [Repository Atlas](#repository-atlas)
11. [Reference Snippets](#reference-snippets)

---

## Mission Snapshot

- **Canonical treasury binding** — The runtime is locked to the 18-decimal `$AGIALPHA` contract [`0xa61a3b3a130a9c20768eebf97e21515a6046a1fa`](https://etherscan.io/address/0xa61a3b3a130a9c20768eebf97e21515a6046a1fa) for every staking, reward, and settlement action.
- **Owner-dominated controls** — Governance, pausing, validator rosters, stake withdrawal, identity registration, and controller updates remain exclusively in the owner’s hands (`AlphaNodeManager.sol`).
- **Deterministic attestation** — Health pings are canonicalized, signed, and independently verifiable to guarantee liveness and identity integrity.
- **Production-hardening** — Markdown + link linting, Vitest suites, Solidity lint/compile, subgraph builds, Docker smoke tests, and security audits are enforced as required PR checks.
- **Operator empathy** — Scripts, Helm charts, and Docker images let non-technical operators deploy without touching internals while keeping full override control.

---

## Quickstart

```mermaid
flowchart LR
  A[Clone repository] --> B[npm ci]
  B --> C[Copy .env.example → .env]
  C --> D[npm run ci:verify]
  D --> E[npm run demo:local]
  E --> F[node src/index.js container --once]
```

1. **Clone & install**

   ```bash
   git clone https://github.com/MontrealAI/AGI-Alpha-Node-v0.git
   cd AGI-Alpha-Node-v0
   npm ci
   ```

   Node.js **20.18+** is enforced in `package.json` for deterministic builds.

2. **Configure identity & payouts**
   - Copy `.env.example` to `.env` and fill ENS label/name, payout targets, telemetry endpoints, staking thresholds, and RPC endpoints.
   - Provide signing material through `ALPHA_NODE_KEYFILE` (JSON keyfile) or `NODE_PRIVATE_KEY` so live attestations match your ENS-published pubkey.
   - Verify ENS alignment before launching:

     ```bash
     npm run ens:inspect -- --name <your-node>.eth
     node -e "import { loadNodeIdentity } from './src/identity/loader.js'; (async()=>console.log(await loadNodeIdentity('<your-node>.eth')))();"
     ```

3. **Mirror CI locally**

   ```bash
   npm run ci:verify
   ```

   Runs markdown + link linting, Vitest, coverage, Solidity lint/compile, subgraph builds, npm audit (high), policy/branch gates.

4. **Launch the orchestrator**

   ```bash
   npm run demo:local       # seeds fixtures and observability loops
   node src/index.js container --once
   ```

   Bootstrap hydrates ENS, governance, staking posture, telemetry, and health gate before dispatching α-work.

---

## Health Attestation Mesh

```mermaid
flowchart TD
  subgraph Identity
    A[NodeIdentity snapshot] --> B(createHealthAttestation)
  end
  subgraph Signing
    B --> C(signHealthAttestation)
    C --> D(startHealthChecks)
  end
  subgraph Emission
    D --> E[EventEmitter / callbacks]
    E --> F[Telemetry exporters]
    E --> G[Stdout dev tap]
  end
  subgraph Verification
    F --> H[verifyAttestation]
    H --> I[verifyAgainstENS]
  end
```

- **Schema** — [`src/attestation/schema.ts`](src/attestation/schema.ts) defines `HealthAttestation` v1 with `timestamp`, `ensName`, `peerId`, `nodeVersion`, `multiaddrs`, optional `fuses/expiry/latency/meta`, and `status` (`healthy | degraded | unhealthy`). Canonical JSON serialization keeps signatures stable.
- **Emission** — [`src/attestation/health_service.ts`](src/attestation/health_service.ts) builds attestations from `NodeIdentity`, measures latency, signs via node keypair, emits through an `EventEmitter` and optional callback, and can pretty-print to stdout for dev observability.
- **Verification** — [`src/attestation/verify.ts`](src/attestation/verify.ts) recomputes canonical digests and verifies `secp256k1` or `ed25519` signatures. `verifyAgainstENS` reloads the ENS identity to prevent drift from owner-declared records.
- **Dev tap** — Start a periodic signer in any runtime:

  ```ts
  import { startHealthChecks } from './src/attestation/health_service.js';
  import { loadNodeIdentity } from './src/identity/loader.js';
  import { loadKeypair } from './src/identity/keys.js';

  const identity = await loadNodeIdentity('1.alpha.node.agi.eth');
  const keypair = await loadKeypair();
  const handle = startHealthChecks(identity, keypair, { intervalMs: 30_000, logToConsole: true });
  // handle.stop() when shutting down
  ```

### Sample signed attestation

```json
{
  "attestation": {
    "version": "v1",
    "timestamp": "2024-06-01T00:00:00.000Z",
    "ensName": "alpha.node.eth",
    "peerId": "12D3KooXexample",
    "role": "orchestrator",
    "nodeVersion": "1.0.0",
    "multiaddrs": ["/dns4/example.com/tcp/443/wss/p2p/12D3KooXexample"],
    "status": "healthy",
    "latencyMs": 42
  },
  "signature": "0x…",
  "signatureType": "secp256k1"
}
```

---

## $AGIALPHA Treasury & Owner Authority

- **Token constants** — `$AGIALPHA`, 18 decimals, canonical address enforced in [`src/constants/token.js`](src/constants/token.js) and [`src/config/schema.js`](src/config/schema.js). Any divergent override is rejected.
- **Owner powers** — [`contracts/AlphaNodeManager.sol`](contracts/AlphaNodeManager.sol) grants the owner exclusive control to pause/unpause, set validators, register/revoke ENS identities, swap controllers, toggle identity status, and withdraw stake. Stake deposits require active identities and honor the canonical token.
- **Runtime governance** — CLI and services in [`src/services/governance.js`](src/services/governance.js), [`src/services/governanceLedger.js`](src/services/governanceLedger.js), [`src/services/governanceStatus.js`](src/services/governanceStatus.js) surface owner-only directives for emissions, validator thresholds, and payout tuning.
- **Payout fidelity** — Staking, reward, and treasury loops in [`src/services/staking.js`](src/services/staking.js), [`src/services/rewards.js`](src/services/rewards.js), and [`src/services/economics.js`](src/services/economics.js) normalize token math to wei precision so treasury accounting never drifts.

---

## ENS-Aligned Identity Fabric

- **Identity loader** — [`src/identity/loader.ts`](src/identity/loader.ts) hydrates ENS pubkeys, peerIds, `_dnsaddr` multiaddrs, fuses, expiry, and metadata before any orchestrator work is scheduled.
- **Resolver tooling** — [`src/ens/config.ts`](src/ens/config.ts) and [`src/ens/client.ts`](src/ens/client.ts) encapsulate ENS registry/resolver addresses, while [`src/identity/dnsaddr.ts`](src/identity/dnsaddr.ts) normalizes multiaddrs for libp2p alignment.
- **Health gate** — [`src/services/healthGate.js`](src/services/healthGate.js) ties stake posture, heartbeat freshness, and diagnostics into a single decision point so orchestrators only run when identities are healthy and funded.

---

## Autonomous Job Orchestration

- **Lifecycle kernel** — [`src/services/jobLifecycle.js`](src/services/jobLifecycle.js) drives discovery → execution → validation → settlement for α-work units with auditable journaling.
- **Control plane** — [`src/services/controlPlane.js`](src/services/controlPlane.js) accepts owner directives and routes workloads into the orchestrator mesh.
- **Validator loop** — [`src/validator/validatorLoop.js`](src/validator/validatorLoop.js) and [`src/validator/runtime.js`](src/validator/runtime.js) enforce validation, quorum, and proof replay discipline.
- **Swarm intelligence** — [`src/intelligence/swarmOrchestrator.js`](src/intelligence/swarmOrchestrator.js), [`src/intelligence/planning.js`](src/intelligence/planning.js), and [`src/intelligence/learningLoop.js`](src/intelligence/learningLoop.js) coordinate autonomous agents while respecting owner priorities.

---

## Observability Stack

- **Metrics** — [`src/telemetry/monitoring.js`](src/telemetry/monitoring.js) exposes Prometheus metrics populated by gauges in [`src/telemetry/alphaMetrics.js`](src/telemetry/alphaMetrics.js).
- **AlphaWU signals** — [`src/telemetry/alphaWuTelemetry.js`](src/telemetry/alphaWuTelemetry.js) records execution and reward traces for every α-work unit.
- **Healthcheck endpoint** — [`src/healthcheck.js`](src/healthcheck.js) provides liveness probes aligned with the health gate and identity posture.

---

## Testing & CI Gates

```mermaid
flowchart LR
  PR[PR/Main] --> Lint[Lint Markdown+Links]
  PR --> Tests[Vitest]
  PR --> Coverage[Coverage]
  PR --> Solidity[Solhint+Compile]
  PR --> Subgraph[Subgraph Build]
  PR --> Docker[Docker Smoke]
  PR --> Security[npm audit --audit-level=high]
  Tests & Lint & Coverage & Solidity & Subgraph & Docker & Security --> Gate[Required Checks]
```

- **Full sweep** — `npm run ci:verify` mirrors the GitHub Actions workflow: linting, tests, coverage, Solidity hygiene, subgraph build, npm audit (high), health/branch gates.
- **PR enforcement** — Required checks are listed in [`.github/required-checks.json`](.github/required-checks.json) and enforced on pull requests and `main`.
- **Targeted commands**
  - `npm run lint` — Markdown + link linting
  - `npm test` — Vitest suites
  - `npm run coverage` — c8 coverage report
  - `npm run ci:solidity` — solhint + solc harness
  - `npm run ci:ts` — subgraph codegen + build
  - `npm run ci:security` — npm audit (high)

---

## Deployment Vectors

- **Docker** — Build and smoke-test locally:

  ```bash
  docker build -t agi-alpha-node:local .
  docker run --rm \
    -e NODE_LABEL=smoke-test \
    -e OPERATOR_ADDRESS=0x0000000000000000000000000000000000000001 \
    -e RPC_URL=https://rpc.invalid \
    agi-alpha-node:local --help
  ```

- **Helm** — Production chart at [`deploy/helm/agi-alpha-node`](deploy/helm/agi-alpha-node).
- **Subgraph** — Subgraph build pipeline lives in [`subgraph/`](subgraph/) and is exercised by `npm run ci:ts`.

---

## Repository Atlas

| Path | Purpose |
| --- | --- |
| `src/attestation/` | Health schema, signer, and verifier helpers. |
| `src/identity/` | ENS identity loaders, key handling, DNSAddr normalization. |
| `src/services/` | Governance, staking, rewards, control plane, lifecycle, telemetry gates. |
| `src/orchestrator/` | Node bootstrap, monitor loop, runtime coordination. |
| `src/intelligence/` | Planning, learning, swarm orchestration, stress harnesses. |
| `src/validator/` | Validator runtime and quorum enforcement. |
| `contracts/` | Solidity contracts (AlphaNodeManager, access control, interfaces). |
| `deploy/helm/` | Kubernetes deployment artifacts. |
| `scripts/` | CI gates, ENS inspection, solc harness, badge publisher. |
| `test/` | Vitest suites covering orchestration, ENS, governance, attestation, telemetry. |

---

## Reference Snippets

- **Verify a signed attestation against ENS**

  ```bash
  node --input-type=module <<'NODE'
  import { readFileSync } from 'node:fs';
  import { verifyAgainstENS } from './src/attestation/verify.js';

  const signed = JSON.parse(readFileSync('signed-attestation.json', 'utf8'));
  const ok = await verifyAgainstENS(signed.attestation.ensName, signed);
  console.log(`Attestation valid: ${ok}`);
  NODE
  ```

- **Regenerate subgraph manifest and build**

  ```bash
  npm run ci:ts
  ```

- **Run Prometheus monitoring locally**

  ```bash
  node -e "import { startMonitoringServer } from './src/telemetry/monitoring.js'; startMonitoringServer({ port: 9090 });"
  ```

Harness these primitives to operate a controlled, ever-advancing cognitive network that keeps the owner at the helm while continuously emitting verifiable health, treasury, and governance signals.
