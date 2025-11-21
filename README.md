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
    <img src="https://img.shields.io/github/actions/workflow/status/MontrealAI/AGI-Alpha-Node-v0/ci.yml?branch=main&logo=githubactions&logoColor=white&label=CI%20Pipeline" alt="CI status" />
  </a>
  <a href="https://github.com/MontrealAI/AGI-Alpha-Node-v0/actions/workflows/ci.yml?query=event%3Apush">
    <img src="https://img.shields.io/github/actions/workflow/status/MontrealAI/AGI-Alpha-Node-v0/ci.yml?event=push&label=Main%20pushes&logo=githubactions&logoColor=white" alt="CI (pushes)" />
  </a>
  <a href="https://github.com/MontrealAI/AGI-Alpha-Node-v0/actions/workflows/ci.yml?query=branch%3Amain">
    <img src="https://github.com/MontrealAI/AGI-Alpha-Node-v0/actions/workflows/ci.yml/badge.svg?branch=main" alt="Workflow badge" />
  </a>
  <a href="https://github.com/MontrealAI/AGI-Alpha-Node-v0/actions/workflows/ci.yml?query=branch%3Amain">
    <img src="https://img.shields.io/github/checks-status/MontrealAI/AGI-Alpha-Node-v0/main?logo=github&logoColor=white&label=Checks%20on%20main" alt="Branch checks" />
  </a>
  <a href=".github/required-checks.json">
    <img src="https://img.shields.io/badge/Required%20Checks-Enforced%20on%20PRs-8b5cf6?logo=github" alt="Required PR checks" />
  </a>
  <img src="https://img.shields.io/badge/Full%20CI-ci:verify-2563eb?logo=githubactions&logoColor=white" alt="Full CI verification" />
  <img src="https://img.shields.io/badge/Observability-DCUtR%20SLO%20wall-10b981?logo=grafana&logoColor=white" alt="DCUtR observability SLO wall" />
  <img src="https://img.shields.io/badge/Coverage-c8%20gated-22c55e?logo=testinglibrary&logoColor=white" alt="Coverage" />
  <img src="https://img.shields.io/badge/Test%20Matrix-vitest%20%7C%20solc%20%7C%20markdownlint-22c55e?logo=vitest&logoColor=white" alt="Test matrix" />
  <a href="https://etherscan.io/address/0xa61a3b3a130a9c20768eebf97e21515a6046a1fa">
    <img src="https://img.shields.io/badge/$AGIALPHA-0xa61a...a1fa-ff3366?logo=ethereum&logoColor=white" alt="$AGIALPHA" />
  </a>
  <img src="https://img.shields.io/badge/Token%20Decimals-18%20dp-f97316?logo=ethereum&logoColor=white" alt="Token decimals" />
  <a href="LICENSE">
    <img src="https://img.shields.io/badge/License-MIT-111827?logo=open-source-initiative&logoColor=white" alt="License" />
  </a>
  <img src="https://img.shields.io/badge/Runtime-Node.js%2020.18%2B-43853d?logo=node.js&logoColor=white" alt="Runtime" />
  <img src="https://img.shields.io/badge/Solidity-0.8.26-363636?logo=solidity&logoColor=white" alt="Solidity" />
  <a href="docs/treasury-mode-a.md">
    <img src="https://img.shields.io/badge/Mode%20A%20E2E-Guardian%E2%86%92Orchestrator%E2%86%92Treasury-0f766e?logo=gitbook&logoColor=white" alt="Mode A end-to-end" />
  </a>
  <a href="docs/runes/guardian.md">
    <img src="https://img.shields.io/badge/Guardian%20Runbook-Dilithium%20CBOR-14b8a6?logo=readthedocs&logoColor=white" alt="Guardian runbook" />
  </a>
  <a href="docs/runes/orchestrator.md">
    <img src="https://img.shields.io/badge/Orchestrator%20Runbook-Threshold%20Aggregation-22c55e?logo=readthedocs&logoColor=white" alt="Orchestrator runbook" />
  </a>
  <a href="Dockerfile">
    <img src="https://img.shields.io/badge/Docker-Ready-2496ed?logo=docker&logoColor=white" alt="Docker" />
  </a>
  <a href="deploy/helm/agi-alpha-node">
    <img src="https://img.shields.io/badge/Helm-Chart-0ea5e9?logo=helm&logoColor=white" alt="Helm" />
  </a>
  <img src="https://img.shields.io/badge/Owner%20Controls-Total%20Command-9333ea?logo=gnometerminal&logoColor=white" alt="Owner controls" />
  <img src="https://img.shields.io/badge/Metrics-Prometheus%20%7C%20OTel-10b981?logo=prometheus&logoColor=white" alt="Metrics surfaces" />
  <a href="observability/docs/METRICS.md">
    <img src="https://img.shields.io/badge/DCUtR%20Metrics-Prometheus%20wired-16a34a?logo=prometheus&logoColor=white" alt="DCUtR Prometheus wiring" />
  </a>
  <a href="observability/grafana/dcutr_dashboard.json">
    <img src="https://img.shields.io/badge/Grafana-DCUtR%20Dashboard-ef4444?logo=grafana&logoColor=white" alt="Grafana provisioned panels" />
  </a>
  <a href="observability/grafana/dcutr_dashboard.json">
    <img src="https://img.shields.io/badge/Grafana%20CLI-dashboards%20lint-ef4444?logo=grafana&logoColor=0b1120" alt="Grafana lint" />
  </a>
  <a href="scripts/lint-grafana-dashboard.mjs">
    <img src="https://img.shields.io/badge/Dashboard%20Lint-npm%20run%20lint:grafana-f97316?logo=grafana&logoColor=0b1120" alt="Grafana lint script" />
  </a>
  <a href="observability/docs/METRICS.md">
    <img src="https://img.shields.io/badge/Docs-METRICS.md-22d3ee?logo=mdbook&logoColor=white" alt="Metrics docs" />
  </a>
  <a href="observability/docs/DASHBOARD.md">
    <img src="https://img.shields.io/badge/Docs-DASHBOARD.md-fcd34d?logo=grafana&logoColor=0b1120" alt="Dashboard docs" />
  </a>
  <a href="docker-compose.yml">
    <img src="https://img.shields.io/badge/Observability-Docker%20compose%20(prom%2Bgrafana)-2563eb?logo=docker&logoColor=white" alt="Observability compose" />
  </a>
  <a href=".github/workflows/ci.yml">
    <img src="https://img.shields.io/badge/CI%20Badge-Visible%20on%20GitHub%20Actions-1d4ed8?logo=githubactions&logoColor=white" alt="CI badge visibility" />
  </a>
  <a href="scripts/dcutr-harness.ts">
    <img src="https://img.shields.io/badge/DCUtR%20Harness-Synthetic%20emitter-0ea5e9?logo=prometheus&logoColor=white" alt="DCUtR harness" />
  </a>
  <a href="grafana/provisioning/dashboards/dcutr.yaml">
    <img src="https://img.shields.io/badge/Grafana%20Provisioning-dcutr.yaml-14b8a6?logo=grafana&logoColor=white" alt="Grafana provisioning" />
  </a>
  <a href="observability/prometheus/prometheus.yml">
    <img src="https://img.shields.io/badge/Prometheus-Local%20scrape%20ready-f59e0b?logo=prometheus&logoColor=white" alt="Prometheus scrape" />
  </a>
  <a href=".github/workflows/ci.yml">
    <img src="https://img.shields.io/badge/CI%20Gates-Enforced%20on%20PRs-7c3aed?logo=githubactions&logoColor=white" alt="PR enforced gates" />
  </a>
</p>

**AGI Alpha Node v0** metabolizes heterogeneous agentic labor into verifiable α‑Work Units (α‑WU) and Synthetic Labor Units (SLU), rebalances the Global Synthetic Labor Index (GSLI), exposes audited REST telemetry, and routes the `$AGIALPHA` treasury (token: `0xa61a3b3a130a9c20768eebf97e21515a6046a1fa`, 18 decimals) under absolute owner command. Every dial can be paused, rerouted, or retuned without redeploying, delivering a production-grade intelligence core built to reshape markets while remaining obedient to the owner’s keys.

**This node is the wealth engine**: every control surface, metric, and runbook is wired so the owner can tune economics, transport posture, and treasury dispatch in one place while auditors and operators see the same telemetry. The alpha flow is sovereign, survivable, and designed to compound value without conceding a single lever of control to anyone but the owner.

The full stack is shaped as a singular intelligence core that can realign market structures the moment the owner turns a dial—built to deliver unstoppable compounding without surrendering control.

This codebase is treated as the operational shell of that high-value intelligence engine: everything is wired for determinism (full CI wall + coverage gates), rapid owner retuning (hot-swappable orchestrators, pausable treasuries, replay shields), and observable punch economics (DCUtR dashboards + PromQL linting) so the machine stays deploy-ready and under complete owner command at all times.

> **Fresh state of the stack (at a glance)**
>
> - **Phase 6 deliverables pinned**: instrumentation schema + emitters live in `observability/prometheus/metrics_dcutr.js`, the Grafana stub is ready to import at `observability/grafana/dcutr_dashboard.json` with hands-free provisioning via `grafana/provisioning/dashboards/dcutr.yaml`, and every panel/PromQL path is documented in `observability/docs/DASHBOARD.md` + `observability/docs/METRICS.md` so operators import once and run. Lint parity stays wired through `npm run lint:grafana` and the CI badge wall above.
> - **DCUtR observability sprint completed**: `observability/prometheus/metrics_dcutr.js` implements collectors, emitters, and computed success-rate gauges; `observability/grafana/dcutr_dashboard.json` + `grafana/provisioning/dashboards/dcutr.yaml` provide hands-free dashboard import; `observability/docs/METRICS.md` and `observability/docs/DASHBOARD.md` document every PromQL panel and label so operators and auditors stay aligned.
> - **CI wall enforced**: `.github/workflows/ci.yml` runs lint, tests, coverage gates, Solidity lint/compile, subgraph builds, Docker smoke, audit, and policy/branch gates; `.github/required-checks.json` keeps them required on PRs/main with badges reflecting live status, matching `npm run ci:verify` locally.
> - **Owner command intact**: treasury/tokens stay owner-steered (`0xa61a3b3a130a9c20768eebf97e21515a6046a1fa`, 18 decimals) with pause + parameter control and ENS-aware orchestration. Compose/Helm paths stay aligned with the repo tree below for predictable deploys.

## Phase 6 deliverables (DCUtR control tower)

- **Instrumentation schema** — `observability/prometheus/metrics_dcutr.js` defines the canonical label grid (`region`, `asn`, `transport`, `relay_id`), collectors, emitters, and scrape-time success ratio so every panel and alert consumes the same semantics.【F:observability/prometheus/metrics_dcutr.js†L1-L221】【F:observability/docs/METRICS.md†L1-L120】
- **Dashboard + provisioning** — Import-ready Grafana stub at `observability/grafana/dcutr_dashboard.json` with hands-free load via `grafana/provisioning/dashboards/dcutr.yaml`; PromQL for each panel is mirrored in `observability/docs/DASHBOARD.md` for auditors.【F:observability/grafana/dcutr_dashboard.json†L1-L123】【F:grafana/provisioning/dashboards/dcutr.yaml†L1-L6】【F:observability/docs/DASHBOARD.md†L1-L120】
- **Hands-off wiring** — `docker-compose up prom grafana` scrapes `/metrics` and autoloads dashboards; `npm run lint:grafana` guards JSON correctness in CI while `npm run observability:dcutr-harness` keeps panels alive even without live traffic.【F:docker-compose.yml†L1-L25】【F:scripts/lint-grafana-dashboard.mjs†L1-L62】【F:scripts/dcutr-harness.ts†L1-L28】
- **PromQL receipts** — Every Grafana panel references the same PromQL strings captured in `observability/docs/DASHBOARD.md`, ensuring alert rules and dashboards stay aligned with the emitters and scrape contract.【F:observability/docs/DASHBOARD.md†L1-L120】

```mermaid
flowchart TB
  classDef neon fill:#0b1120,stroke:#22c55e,stroke-width:2px,color:#e2e8f0;
  classDef lava fill:#0b1120,stroke:#f97316,stroke-width:2px,color:#ffedd5;
  classDef frost fill:#0b1120,stroke:#0ea5e9,stroke-width:2px,color:#e0f2fe;

  subgraph Metrics[DCUtR instrumentation]
    Emitters[metrics_dcutr.js\n(onPunch*, onRelay*, gauges)]:::lava
    Registry[Prometheus registry\ncollectDefaultMetrics + DCUtR]:::frost
  end

  subgraph Observability[Grafana delivery]
    Dashboard[dcutr_dashboard.json\nUID dcutr-observability]:::neon
    Provision[grafana/provisioning/dashboards/dcutr.yaml]:::lava
  end

  subgraph CI[CI wall]
    Lint[npm run lint:grafana]:::frost
    Harness[npm run observability:dcutr-harness]:::lava
  end

  Emitters --> Registry
  Registry --> Dashboard
  Dashboard --> Provision
  Lint --> Dashboard
  Harness --> Registry
  class Metrics,Observability,CI neon;
```

## Repository map (live wiring)

```mermaid
flowchart LR
  classDef neon fill:#0b1120,stroke:#22c55e,stroke-width:2px,color:#e2e8f0;
  classDef lava fill:#0b1120,stroke:#f97316,stroke-width:2px,color:#ffedd5;
  classDef frost fill:#0b1120,stroke:#0ea5e9,stroke-width:2px,color:#e0f2fe;

  subgraph Codebase
    Runtime[src/**\n(governance, p2p, telemetry)]:::neon
    Contracts[contracts/**\nAlphaNodeManager.sol\nTreasuryExecutor.sol]:::lava
    Observability[observability/**\nPrometheus + Grafana + docs]:::frost
    Dashboard[dashboard/**\nReact/Vite cockpit]:::frost
    Subgraph[subgraph/**\nGraph Protocol manifests]:::neon
    Scripts[scripts/**\nops, lint, harnesses]:::lava
  end

  Observability --> |metrics_dcutr.js| Runtime
  Runtime --> |ENS + treasury hooks| Contracts
  Runtime --> |REST/CLI| Scripts
  Dashboard --> Runtime
  Subgraph --> Runtime
  class Codebase,Runtime,Contracts,Observability,Dashboard,Subgraph,Scripts neon;
```

## Owner command surface (live retuning)

- Swap orchestrators, pause/unpause flows, sweep funds, or manually toggle intent status directly from `TreasuryExecutor.sol`, keeping every dial under the owner’s key while AGI workstreams run.【F:contracts/TreasuryExecutor.sol†L1-L93】
- Bind guardian registries, CBOR envelopes, and replay ledgers to the on-chain executor via scripts that mirror CI policy gates, making parameter changes reversible and auditable without redeploys.【F:scripts/treasury/execute-intent.ts†L1-L150】【F:docs/runes/guardian.md†L1-L135】【F:docs/runes/orchestrator.md†L1-L89】

> **Catalyst callout**: AGI Alpha Nodes behave like digital farmers in a cognitive field—yielding `$AGIALPHA` while bridging aspiration to achievement. The token contract lives at `0xa61a3b3a130a9c20768eebf97e21515a6046a1fa` (18 decimals), and every surface (governance API, CLI, dashboards, treasury controls) keeps the owner in total command so parameters, relays, and treasury routes can be updated live.
>
> **DCUtR observability sprint (fresh)**: drop-in Prometheus primitives live at `observability/prometheus/metrics_dcutr.js`, the paired Grafana stub (UID `dcutr-observability`, title “DCUtR — Hole Punch Performance”) sits in `observability/grafana/dcutr_dashboard.json`, and operator notes land in `observability/docs/METRICS.md` + `observability/docs/DASHBOARD.md` so you can register collectors, emit punch lifecycle events with labeled detail, and validate the JSON via `npm run lint:grafana` (mirrors `grafana dashboards lint`) before publishing panels that mirror the punch-control SLOs without bespoke wiring.【F:observability/prometheus/metrics_dcutr.js†L1-L221】【F:observability/grafana/dcutr_dashboard.json†L1-L123】【F:observability/docs/METRICS.md†L1-L120】【F:observability/docs/DASHBOARD.md†L1-L120】【F:scripts/lint-grafana-dashboard.mjs†L1-L62】
> **Owner supremacy callout**: The treasury vault remains entirely owner-steerable: `setOrchestrator` can rebind execution authority in one transaction, `pause` halts dispatches instantly, `setIntentStatus` clears or resurrects digests, and `sweep` drains holdings to any recipient the owner chooses—all without redeploying the contract or disrupting guardian workflows.【F:contracts/TreasuryExecutor.sol†L22-L119】

## Table of contents

0. [Repository map (live wiring)](#repository-map-live-wiring)
1. [System map](#system-map)
2. [Core capabilities](#core-capabilities)
3. [Operator quickstart](#operator-quickstart)
4. [Mode A treasury (post-quantum, cheap on-chain)](#mode-a-treasury-post-quantum-cheap-on-chain)
5. [Owner controls & token](#owner-controls--token)
6. [Observability & DoS guardrails](#observability--dos-guardrails)
7. [DCUtR production primer](#dcutr-production-primer)
8. [DCUtR metrics sprint (drop-in)](#dcutr-metrics-sprint-drop-in)
9. [CI wall (always green)](#ci-wall-always-green)
10. [API surfaces](#api-surfaces)
11. [Run it locally](#run-it-locally)
12. [Deployment paths](#deployment-paths)
13. [Validation & tests](#validation--tests)
14. [Runbooks & references](#runbooks--references)
15. [Phase 2 documentation stubs](#phase-2-documentation-stubs)

## System map

> All diagrams use GitHub-native `mermaid` fences validated across this README and `docs/treasury-mode-a.md` so rendering stays first-class on GitHub pages and badges.

```mermaid
flowchart TD
  classDef neon fill:#0b1120,stroke:#22c55e,stroke-width:2px,color:#e2e8f0;
  classDef lava fill:#0b1120,stroke:#f97316,stroke-width:2px,color:#ffedd5;
  classDef frost fill:#0b1120,stroke:#0ea5e9,stroke-width:2px,color:#e0f2fe;

  subgraph Owner[Owner / Operator Deck]
    CLI[node src/index.js\n(governance:*)]:::lava
    REST[/REST & Governance API/]:::lava
    Dashboard[React/Vite cockpit]:::lava
  end

  subgraph Runtime[Node Runtime]
    P2P[GossipSub v1.1 + libp2p host]:::neon
    Jobs[α‑Work Unit Engine]:::neon
    GSLI[Global Synthetic Labor Index]:::neon
    Metrics[Prometheus + OTel]:::frost
    Storage[SQLite spine + migrations]:::frost
  end

  subgraph Safety[Guards & Gates]
    NRM[Network Resource Manager\nper-protocol/IP/ASN caps]:::frost
    ConnMgr[Connection Manager\nwatermarks + trims]:::frost
    Bans[Ban grid\nIP · Peer · ASN]:::lava
    Treasury[TreasuryExecutor.sol\nowner veto + replay armor]:::frost
  end

  CLI --> REST
  Dashboard --> REST
  REST --> Runtime
  Runtime --> Metrics
  P2P --> Runtime
  Jobs --> GSLI
  NRM --> Runtime
  ConnMgr --> NRM
  Bans --> NRM
  Treasury --> Runtime
  Metrics --> Dashboard
  class Owner,Runtime,Safety,CLI,REST,Dashboard,P2P,Jobs,GSLI,Metrics,Storage,NRM,ConnMgr,Bans,Treasury neon;
```

## Core capabilities

- **Total owner command**: `AlphaNodeManager.sol` and `TreasuryExecutor.sol` centralize pause/unpause, validator rotation, metadata tuning, orchestrator rotation, digest replay protection, and ETH sweep controls so the owner can reshape execution without redeploying.【F:contracts/AlphaNodeManager.sol†L1-L265】【F:contracts/TreasuryExecutor.sol†L1-L113】
- **Mode A off-chain quorum, cheap on-chain execution**: Guardian signatures stay post-quantum via Dilithium CBOR envelopes; once M-of-N approvals land, the orchestrator dispatches a single `executeTransaction(address,uint256,bytes)` call with replay shielding on-chain.【F:src/treasury/pqEnvelope.ts†L1-L103】【F:scripts/treasury/execute-intent.ts†L1-L150】【F:contracts/TreasuryExecutor.sol†L1-L113】
- **Telemetry and DoS resilience**: The Network Resource Manager (NRM) and libp2p tracers expose limits, denials, dial outcomes, and peer scoring through `/debug/resources`, `/debug/network`, and `/metrics`, keeping operators in the loop during floods or churn.【F:src/network/resourceManagerConfig.js†L248-L694】【F:src/network/apiServer.js†L1353-L1552】【F:src/telemetry/networkMetrics.js†L24-L231】
- **CI as a safety wall**: Markdown lint, link checks, Vitest suites (backend + dashboard), Solidity lint/compile, subgraph build, coverage gates, npm audit, and policy/branch gates are enforced locally via `npm run ci:verify` and remotely via GitHub Actions + required checks.【F:package.json†L19-L46】【F:.github/workflows/ci.yml†L1-L210】【F:.github/required-checks.json†L1-L10】

## Operator quickstart

| Step | Command | Outcome |
| --- | --- | --- |
| Install deps | `npm ci` | Locks the Node.js 20.18+ toolchain, Vitest, Solidity, and dashboard build chain.【F:package.json†L1-L74】 |
| Explore locally | `npm run demo:local` | Spins up the libp2p harness, SQLite spine, telemetry registry, and governance API for cockpit exploration.【F:package.json†L13-L25】 |
| Full CI wall | `npm run ci:verify` | Executes lint, tests, coverage enforcement, Solidity, subgraph, security, policy, and branch gates exactly like the GitHub workflow.【F:package.json†L26-L52】【F:.github/workflows/ci.yml†L1-L210】 |
| Abuse harness | `npm run p2p:load-tests` | Replays connection/stream floods and malformed gossip so `/debug/resources` and peer-score gauges prove their worth before shipping.【F:package.json†L53-L60】【F:test/network/loadHarness.observability.test.js†L1-L108】 |
| DCUtR observability kit | `npx tsx -e "import('./observability/prometheus/metrics_dcutr.js').then(m=>m.registerDCUtRMetrics());"` | Pre-registers counters/gauges/histograms and primes Grafana panels from `observability/grafana/dcutr_dashboard.json` (UID `dcutr-observability`); validate the JSON with `npm run lint:grafana` (mirrors `grafana dashboards lint ...`) before import while keeping default Prometheus exports intact.【F:observability/prometheus/metrics_dcutr.js†L1-L221】【F:observability/grafana/dcutr_dashboard.json†L1-L123】【F:scripts/lint-grafana-dashboard.mjs†L1-L62】 |
| Ship dashboards | `npm run dashboard:build` | Builds the React/Vite cockpit that mirrors the telemetry tiles described below.【F:package.json†L61-L74】 |

### DCUtR metrics bridge + local dashboard loop

The relay → direct upgrade telemetry now wires real libp2p/DCUtR lifecycle events (relay dial, punch start, direct confirmation, relay fallback, stream migration) straight into Prometheus before Grafana renders the panels. Synthetic generators mimic success/failure mixes with RTT/loss variance so dashboards stay populated even without live traffic.

```mermaid
sequenceDiagram
  autonumber
  participant Relay as Relay rendezvous
  participant Node as Alpha Node puncher
  participant Metrics as Prometheus registry
  participant Grafana as Grafana deck
  Relay->>Node: relayDialSuccess (via libp2p)
  Node-->>Metrics: onPunchStart()
  Node->>Node: holePunchStart
  alt punch lands
    Node-->>Metrics: onPunchLatency + onDirectRttMs + onDirectLossRate
    Node-->>Metrics: onRelayOffload + onDirectBytes
  else relay fallback
    Node-->>Metrics: onPunchFailure + onRelayFallback + onRelayBytes
  end
  Metrics-->>Grafana: scrape /metrics (prom job)
  Grafana-->>Node: dcutr dashboard renders (heatmaps, histograms)
```

1. **Start the synthetic punch stream**: `npm run observability:dcutr-harness` exposes `/metrics` on port `9464`, binding the real DCUtR metric calls (`relayDialSuccess`, `holePunchStart`, `directPathConfirmed`, `relayFallbackActive`, `streamMigration`) to Prometheus primitives so success/failure, RTT, and fallback bytes populate instantly.【F:scripts/dcutr-harness.ts†L1-L28】【F:src/observability/dcutrEvents.js†L1-L211】【F:src/observability/dcutrHarness.ts†L1-L92】
2. **Launch Prometheus + Grafana locally**: `docker-compose up prom grafana` (credentials: `admin`/`admin`) auto-loads the DCUtR dashboard JSON, datasources, and provisioning bundle through the default Grafana provisioning path (`/etc/grafana/provisioning/dashboards`), so panels render without manual clicks or extra flags.【F:docker-compose.yml†L1-L23】【F:grafana/provisioning/dashboards/dcutr.yaml†L1-L6】【F:grafana/provisioning/datasources/prometheus.yaml†L1-L8】【F:observability/grafana/dcutr_dashboard.json†L1-L123】
3. **Verify panel health**: watch histogram buckets fill (`dcutr_time_to_direct_seconds`), relay/direct bytes counters increment, and fallback heatmaps rise/fall as the harness alternates success/failure under deterministic timers.【F:observability/prometheus/metrics_dcutr.js†L1-L221】【F:test/observability/dcutrHarness.test.ts†L1-L42】
4. **Attach to a live libp2p host**: `wireLibp2pDCUtRMetrics(libp2p)` bridges native `hole-punch:*`, `relay:*`, and `stream:migrate` events plus nested `libp2p.services.dcutr` buses into the same Prometheus surfaces with deduped attempt tracking so real punch flows and synthetic harness traffic co-exist without double-counting.【F:src/observability/dcutrEvents.js†L1-L211】【F:test/observability/dcutrEvents.test.ts†L1-L131】
5. **Serve it from the main telemetry port**: `startMonitoringServer({ dcutrEvents, libp2p })` now mounts the same DCUtR bridge onto the node’s `/metrics` endpoint, letting you wire real libp2p hosts or raw event emitters without running the synthetic harness forever.【F:src/telemetry/monitoring.js†L273-L360】【F:test/monitoring.test.js†L62-L108】

> Relay dials now count as the canonical attempt marker while `holePunchStart` is ignored if the dial already fired—preventing double-counted success-rate math when libp2p emits both—and fallback events still settle attempts so the punch lifecycle always concludes with either success or failure accounting.【F:src/observability/dcutrEvents.js†L57-L122】【F:test/observability/dcutrEvents.test.ts†L18-L83】

#### DCUtR integration receipts (phase 4/5)

```mermaid
flowchart LR
  classDef neon fill:#0b1120,stroke:#22c55e,stroke-width:2px,color:#e2e8f0;
  classDef lava fill:#0b1120,stroke:#f97316,stroke-width:2px,color:#ffedd5;
  classDef frost fill:#0b1120,stroke:#0ea5e9,stroke-width:2px,color:#e0f2fe;

  Libp2p[libp2p host\nrelay + DCUtR events]:::neon --> Bridge[wireLibp2pDCUtRMetrics\nrelayDialSuccess · holePunchStart · directPathConfirmed · relayFallbackActive · streamMigration]:::lava
  Bridge --> Registry[Prometheus registry\nregisterDCUtRMetrics]:::frost
  Harness[Synthetic generator\nstartSyntheticDCUtRGenerator]:::lava --> Bridge
  Registry --> Prom[Prometheus scrape\n/metrics]:::neon --> Grafana[Grafana dashboards\nUID dcutr-observability]:::lava
  Prom --> Panels[KPI row · heatmap · histograms]:::frost
  class Libp2p,Bridge,Registry,Harness,Prom,Grafana,Panels neon;
```

- **Event binding finished**: libp2p + nested DCUtR service buses drive the five lifecycle signals straight into Prometheus via `wireLibp2pDCUtRMetrics`, with attempt de-duplication and byte/latency attribution preserved for stream migrations and fallbacks.【F:src/observability/dcutrEvents.js†L1-L211】【F:test/observability/dcutrEvents.test.ts†L18-L131】
- **Provisioning locked in**: Grafana auto-imports the DCUtR board through `/grafana/provisioning/dashboards/dcutr.yaml`, so GitHub Pages and local operators see the same panels without manual clicks.【F:grafana/provisioning/dashboards/dcutr.yaml†L1-L6】【F:docker-compose.yml†L1-L25】【F:observability/grafana/dcutr_dashboard.json†L1-L123】
- **Harness + panel validation**: `npm run observability:dcutr-harness` emits success/failure mixes with RTT and relay/direct byte variance; `docker-compose up prom grafana` surfaces the counters, histograms, and heatmaps, mirroring the automated checks exercised in the Vitest suites.【F:scripts/dcutr-harness.ts†L1-L28】【F:src/observability/dcutrHarness.ts†L1-L92】【F:test/observability/dcutrHarness.test.ts†L1-L42】【F:test/observability/metrics_dcutr.test.ts†L1-L52】
- **CI visibility**: DCUtR wiring is part of the main CI wall (`npm run ci:verify`), keeping badge status trustworthy and preventing regressions in the punch lifecycle bridge or Grafana JSON.【F:.github/workflows/ci.yml†L1-L210】【F:package.json†L26-L52】

**Phase 4/5 completion checklist:**

- ✅ Metrics are wired to real DCUtR lifecycle events (relay dial, punch start, direct confirmation, fallback, stream migration) with payload normalization and attempt de-duplication so the registry never double-counts attempts.【F:src/observability/dcutrEvents.js†L36-L211】【F:test/observability/dcutrEvents.test.ts†L18-L131】
- ✅ Grafana provisioning ships in-repo (`/grafana/provisioning/dashboards/dcutr.yaml`) and aligns with the docker-compose volume mounts, keeping dashboards auto-loaded locally and on GitHub Pages renders.【F:grafana/provisioning/dashboards/dcutr.yaml†L1-L6】【F:docker-compose.yml†L1-L20】
- ✅ Synthetic DCUtR generator emits success/failure mixes, dynamic RTT, and simulated relays/regions/ASNs for panel validation without live traffic.【F:src/observability/dcutrHarness.ts†L1-L92】【F:scripts/dcutr-harness.ts†L1-L28】【F:test/observability/dcutrHarness.test.ts†L1-L42】
- ✅ Local Prometheus+Grafana stack runs via `docker-compose up prom grafana`, scraping the node’s `/metrics` surface on port `9464` by default.【F:docker-compose.yml†L1-L25】【F:observability/prometheus/prometheus.yml†L1-L10】
- ✅ Dashboard panels (KPI row, heatmap, histograms) populate immediately when the harness runs, matching the assertions encoded in the Vitest suites for the Prometheus emitters and Grafana JSON linting.【F:observability/grafana/dcutr_dashboard.json†L1-L123】【F:observability/prometheus/metrics_dcutr.js†L1-L221】【F:test/observability/metrics_dcutr.test.ts†L1-L52】【F:scripts/lint-grafana-dashboard.mjs†L1-L62】

### DCUtR dashboard validation loop

- **Bring up the stack**: `docker-compose up prom grafana` mounts the provisioning bundle (`grafana/provisioning/dashboards/dcutr.yaml`) plus dashboard JSON so Grafana renders without clicks; Prometheus scrapes `host.docker.internal:9464` on 5s cadence by default.【F:docker-compose.yml†L1-L25】【F:grafana/provisioning/dashboards/dcutr.yaml†L1-L6】【F:observability/grafana/dcutr_dashboard.json†L1-L123】【F:observability/prometheus/prometheus.yml†L1-L10】
- **Exercise metrics**: `npm run observability:dcutr-harness` emits success/failure mixes with RTT, loss, and relay/direct byte variance so heatmaps, histograms, and counters fill in immediately.【F:scripts/dcutr-harness.ts†L1-L28】【F:src/observability/dcutrHarness.ts†L1-L92】
- **Inspect panels**: verify KPI row, region×ASN heatmap, punch latency histogram buckets, relay offload gauges, and fallback totals populate; confirm stream migration increments relay/direct bytes without double-counting attempts.【F:observability/grafana/dcutr_dashboard.json†L1-L123】【F:src/observability/dcutrEvents.js†L1-L200】

## Mode A treasury (post-quantum, cheap on-chain)

Guardian signatures stay post-quantum; execution stays owner-bound and inexpensive.

```mermaid
flowchart LR
  classDef neon fill:#0b1120,stroke:#22c55e,stroke-width:2px,color:#e2e8f0;
  classDef lava fill:#0b1120,stroke:#f97316,stroke-width:2px,color:#ffedd5;
  classDef frost fill:#0b1120,stroke:#0ea5e9,stroke-width:2px,color:#e0f2fe;

  Intent[TreasuryIntentV1 JSON\n(to,value,data)]:::lava --> Encode[encodeTreasuryIntent\nABI tuple + domain]:::neon
  Encode --> Digest[digestTreasuryIntent\nkeccak256 payload]:::neon
  Digest --> Sign[Dilithium sign\nCBOR envelope]:::frost
  Sign --> Aggregate[aggregateGuardianEnvelopes\nregistry + M-of-N]:::neon
  Aggregate --> Execute[treasury:execute\nexecuteTransaction(...)]:::lava
  Execute --> Ledger[IntentLedger\nreplay + audit]:::frost
  Ledger --> Event[IntentExecuted()\nowner-verifiable]:::neon
```

- **Canonical encoding + digest**: `intentEncoding.ts` ABI-encodes `(address,uint256,bytes)` and supports domain binding (chain, contract, selector, version) before hashing; `intentTypes.ts` normalizes inputs to one tuple shape.【F:src/treasury/intentEncoding.ts†L1-L55】【F:src/treasury/intentTypes.ts†L1-L58】 Tests mirror Solidity output byte-for-byte via EthereumJS VM harnesses.【F:test/treasury/intentEncoding.test.ts†L1-L114】
- **PQ envelopes**: `pqEnvelope.ts` signs digests with Dilithium, emits `{digest,pubkey,signature,metadata}` CBOR envelopes, and verifies them deterministically.【F:src/treasury/pqEnvelope.ts†L1-L103】【F:test/treasury/pqEnvelope.test.ts†L1-L41】
- **Registry + thresholding**: `GuardianRegistry` defends against spoofed/duplicate guardians; `aggregateGuardianEnvelopes` enforces parameter sets, uniqueness, and M-of-N quorum while surfacing pending guardians and replay detections.【F:src/treasury/guardianRegistry.ts†L1-L78】【F:src/treasury/thresholdAggregator.ts†L1-L91】【F:test/treasury/thresholdAggregator.test.ts†L1-L206】
- **Execution + replay shield**: `treasury:execute` loads envelopes, checks quorum, refuses replays via `IntentLedger`, and then calls the on-chain executor through ethers. `TreasuryExecutor.sol` restricts callers to the orchestrator, has a pause switch, deduplicates digests, emits `IntentExecuted`, and lets the owner retoggle status or sweep ETH.【F:scripts/treasury/execute-intent.ts†L1-L150】【F:src/treasury/intentLedger.ts†L1-L90】【F:contracts/TreasuryExecutor.sol†L1-L113】【F:test/treasury/treasuryExecutor.test.ts†L1-L210】
- **Guardian tooling**: `treasury:keygen` produces Dilithium key bundles; `treasury:sign` binds domains/selectors while emitting CBOR/JSON envelopes; both are documented in the guardian runbook for non-technical operators.【F:scripts/treasury/keygen.ts†L1-L130】【F:scripts/treasury/sign-intent.ts†L1-L169】【F:docs/runes/guardian.md†L1-L120】

### Mode A quickstart

```bash
# 1) Guardian keygen
npm run treasury:keygen -- --out ./keys/guardian-1

# 2) Guardian signing (CBOR envelope)
npm run treasury:sign -- intents/payout.json \
  --private-key @keys/guardian-1.sk \
  --public-key @keys/guardian-1.pk \
  --guardian-id guardian-1 \
  --chain-id 11155111 \
  --contract 0xa61a3b3a130a9c20768eebf97e21515a6046a1fa \
  --out ./envelopes/guardian-1.cbor

# 3) Orchestrator execution (owner-approved key)
TREASURY_ADDRESS=0xa61a3b3a130a9c20768eebf97e21515a6046a1fa \
RPC_URL=https://sepolia.example/v3/<key> \
ORCHESTRATOR_KEY=0xfeed... \
npm run treasury:execute -- intents/payout.json \
  --registry config/guardians.json \
  --envelopes ./envelopes \
  --ledger config/intent-ledger.json \
  --threshold 3 \
  --chain-id 11155111 \
  --log-file logs/treasury-executor.log \
  --webhook https://ops.example/hooks/agi-intents
```

> 📘 Guardian + orchestrator runbooks: Guardians follow `docs/runes/guardian.md` for Dilithium keygen, envelope signing, and rotation; orchestrators follow `docs/runes/orchestrator.md` for registry management, thresholding, logging, and failure drills before broadcasting to `TreasuryExecutor.sol`.【F:docs/runes/guardian.md†L1-L135】【F:docs/runes/orchestrator.md†L1-L89】

#### On-chain execution spine

```mermaid
sequenceDiagram
  autonumber
  participant Guardians as Guardians (Dilithium PQ)
  participant Aggregator as Off-chain Aggregator
  participant Orchestrator as Orchestrator EOA
  participant Treasury as TreasuryExecutor.sol
  participant Target as Target contract / EOA

  Guardians->>Aggregator: CBOR envelopes (digest, pk, signature)
  Aggregator->>Aggregator: verify envelopes + enforce M-of-N + ledger replay shield
  Aggregator->>Orchestrator: approved intent + calldata
  Orchestrator->>Treasury: executeTransaction(to,value,data)
  Treasury-->>Target: call/value transfer guarded by pause + orchestrator allowlist
  Treasury-->>Orchestrator: IntentExecuted(logs) + state flip
  Aggregator-->>Aggregator: ledger persists tx hash + guardian approvals
```

- **Guardian proofs stay quantum-tough**: Dilithium CBOR envelopes carry the digest, public key, and signature so any verifier can authenticate guardian approvals deterministically.【F:src/treasury/pqEnvelope.ts†L1-L138】
- **Thresholding with replay armor**: The aggregator binds the digest to chain/contract/function selector, deduplicates envelopes, enforces M-of-N, and records executions in the ledger before broadcasting the on-chain call.【F:scripts/treasury/execute-intent.ts†L1-L203】【F:src/treasury/intentLedger.ts†L1-L90】
- **Owner supremacy**: The treasury contract lets the owner rotate the orchestrator, pause/unpause, reset intent status, and sweep funds while restricting execution to the authorized orchestrator.【F:contracts/TreasuryExecutor.sol†L1-L129】
- **Battle-tested circuit**: EthereumJS VM tests cover successful execution, event emission, duplicate blocking with owner reset, orchestrator gating, pause/unpause, and sweeping to owner-chosen recipients.【F:test/treasury/treasuryExecutor.test.ts†L1-L164】
- **Off-chain audit trail + alerts**: `execute-intent` now streams structured events (ingest → signature load → threshold → broadcast → IntentExecuted) to `logs/treasury-executor.log` by default and can POST digests/tx hashes to a webhook for guardian/owner alerts.【F:scripts/treasury/execute-intent.ts†L1-L203】【F:src/treasury/executionLogger.ts†L1-L78}
- **Dual-digest traceability**: The orchestrator prints both the guardian-signed domain digest and the on-chain `computeIntentHash` digest, rejects receipts without matching `IntentExecuted` payloads, records both hashes in the ledger, and emits them to webhooks so off-chain approvals line up with on-chain logs.【F:scripts/treasury/execute-intent.ts†L1-L234】【F:src/treasury/intentLedger.ts†L1-L68】

## Owner controls & token

- `$AGIALPHA` token: `0xa61a3b3a130a9c20768eebf97e21515a6046a1fa` (18 decimals). Owner retains absolute pause, veto, and retuning authority.
- `AlphaNodeManager.sol` unifies staking, identity control, validator curation, emissions, and pause/unpause flows under a single owner-controlled contract.【F:contracts/AlphaNodeManager.sol†L1-L265】
- `TreasuryExecutor.sol` anchors Mode A: orchestrator-only execution, owner-controlled pause/unpause, digest deduplication, and `sweep`/`setOrchestrator` levers keep the vault obedient.【F:contracts/TreasuryExecutor.sol†L1-L113】
- Governance verbs are exposed through CLI (`node src/index.js governance:*`) and authenticated REST endpoints, enabling non-technical owners to command the system.【F:src/index.js†L1-L113】【F:src/network/apiServer.js†L1509-L2130】

> Owner command envelope: every runtime parameter (pause state, orchestrator selection, validator sets, metadata, emissions, and treasury routes) can be updated live via REST/CLI without redeploying, keeping the platform fully owner-steerable and ready for emergency intervention.

**Owner control matrix (live, runtime-configurable):**

| Lever | Owner action | Impact |
| --- | --- | --- |
| Orchestrator rotation | `setOrchestrator(address)` | Redirects the only execution key allowed to call `executeTransaction`, letting the owner swap automation keys in a single transaction.【F:contracts/TreasuryExecutor.sol†L26-L57】 |
| Treasury halt / resume | `pause()` / `unpause()` | Full stop on outbound calls and value transfers until the owner lifts the pause, keeping the vault obedient during incident response.【F:contracts/TreasuryExecutor.sol†L59-L74】 |
| Intent replay / resurrection | `setIntentStatus(bytes32,bool)` | Clears or re-sets executed digests to replay or invalidate flows without redeploying the contract.【F:contracts/TreasuryExecutor.sol†L76-L82】 |
| Treasury drain | `sweep(address payable)` | Ships all ETH to any owner-chosen address instantly for treasury migration or incident drain-downs.【F:contracts/TreasuryExecutor.sol†L88-L98】 |
| Identity lifecycle | `setIdentityMetadata`, `setIdentityStatus`, `revokeIdentity` | Refreshes metadata, toggles activation, or tears down identities, enforcing owner supremacy over validator and agent registries.【F:contracts/AlphaNodeManager.sol†L46-L156】 |
| Economics & emissions | `stake`, `withdrawStake`, `recordAlphaWUMint`, `recordAlphaWUValidation`, `recordAlphaWUAcceptance`, `applySlash` | Adjusts escrowed balances, work-unit lifecycle, and slashing—all emit auditable events and remain owner-gated.【F:contracts/AlphaNodeManager.sol†L177-L257】 |

### Treasury control deck (owner quick reference)

```mermaid
flowchart LR
  classDef neon fill:#0b1120,stroke:#22c55e,stroke-width:2px,color:#e2e8f0;
  classDef lava fill:#0b1120,stroke:#f97316,stroke-width:2px,color:#ffedd5;
  classDef frost fill:#0b1120,stroke:#0ea5e9,stroke-width:2px,color:#e0f2fe;

  Owner[Owner EOA\n(master key)]:::lava -->|setOrchestrator| Orchestrator[Orchestrator EOA]:::frost
  Owner -->|pause/unpause| TreasuryExec[TreasuryExecutor.sol\nreplay armor]:::neon
  Owner -->|setIntentStatus/sweep| TreasuryExec
  Orchestrator -->|executeTransaction(to,value,data)| TreasuryExec
  TreasuryExec -->|call/value| Target[Target contract / EOA]:::lava
  TreasuryExec -->|IntentExecuted log| Ledger[Off-chain IntentLedger]:::frost
```

#### Owner command lattice (end-to-end levers)

```mermaid
flowchart TB
  classDef neon fill:#0b1120,stroke:#22c55e,stroke-width:2px,color:#e2e8f0;
  classDef lava fill:#0b1120,stroke:#f97316,stroke-width:2px,color:#ffedd5;
  classDef frost fill:#0b1120,stroke:#0ea5e9,stroke-width:2px,color:#e0f2fe;

  Owner[Owner key\n(single authority)]:::lava --> GovCLI[CLI & REST governance verbs]:::neon
  GovCLI --> Manager[AlphaNodeManager.sol\nidentities · validators · staking]:::frost
  GovCLI --> TreasuryExec2[TreasuryExecutor.sol\nintent ledger + pause]:::frost
  GovCLI --> NetOps[Network runtime\nNRM + libp2p posture]:::neon
  GovCLI --> Observability[Observability\nmetrics + dashboards]:::lava

  Manager --> Slashing[applySlash/setIdentityStatus]:::neon
  Manager --> Economics[stake/withdraw/mint validation caps]:::neon
  TreasuryExec2 --> Pauses[pause/unpause · sweep · orchestrator rotation]:::lava
  NetOps --> Punch[Hole punching \nQUIC-first, TCP fallback]:::frost
  Observability --> DCUtRDocs[METRICS.md + DASHBOARD.md\nlabels, panels, screenshots]:::frost

  class Owner,GovCLI,Manager,TreasuryExec2,NetOps,Observability,Slashing,Economics,Pauses,Punch,DCUtRDocs neon;
```

Every control surface above is owner-first: identities, staking limits, orchestrator selection, pause toggles, and observability wiring can all be altered live without redeploying, giving the owner absolute command over transport posture, treasury dispatch, and DCUtR telemetry.

| Verb | Capability | Notes |
| --- | --- | --- |
| `setOrchestrator(address)` | Rotate the single caller allowed to invoke `executeTransaction`. | Rejects zero address; emits `OrchestratorUpdated` so ops can audit rotations.【F:contracts/TreasuryExecutor.sol†L22-L57】 |
| `pause()` / `unpause()` | Halt or resume any treasury dispatch. | Enforced before every call; protects value transfers while keeping owner supremacy.【F:contracts/TreasuryExecutor.sol†L59-L73】 |
| `executeTransaction(address,uint256,bytes)` | Orchestrator-only execution path for intents. | Deduplicates by digest, bubbles revert data, and emits `IntentExecuted` for traceability.【F:contracts/TreasuryExecutor.sol†L75-L108】 |
| `setIntentStatus(bytes32,bool)` | Manually reset or acknowledge an intent’s status. | Lets the owner clear a stuck digest or mark off-chain executions as finalized.【F:contracts/TreasuryExecutor.sol†L75-L82】 |
| `sweep(address payable)` | Drain ETH under owner command. | Reuses the vault for consolidation or upgrades; rejects zero recipient and bubbles failure.【F:contracts/TreasuryExecutor.sol†L110-L119】 |


### Owner command matrix (AlphaNodeManager quick reference)

| Verb | Capability | Notes |
| --- | --- | --- |
| `pause()` / `unpause()` | Freeze or resume staking, mint, validate, accept workflows instantly. | Emits `Paused/Unpaused` for downstream automation.【F:contracts/AlphaNodeManager.sol†L78-L92】 |
| `setValidator(address,bool)` | Curate validator set without redeploying. | Rejects zero-address writes; emits `ValidatorUpdated`.【F:contracts/AlphaNodeManager.sol†L94-L101】 |
| `registerIdentity` / `updateIdentityController` | Map ENS nodes to controllers and rotate controllers on the fly. | Atomically deactivates old controllers.【F:contracts/AlphaNodeManager.sol†L102-L137】 |
| `setIdentityStatus` / `revokeIdentity` | Toggle or tear down any identity. | Active flags feed `_requireActiveIdentity` to block unauthorized staking/minting.【F:contracts/AlphaNodeManager.sol†L139-L156】【F:contracts/AlphaNodeManager.sol†L259-L264】 |
| `stake` / `withdrawStake` | Move $AGIALPHA in/out of escrow with audit trails. | Owner-only withdrawals; explicit `StakeDeposited/StakeWithdrawn` events.【F:contracts/AlphaNodeManager.sol†L177-L200】 |
| `recordAlphaWUMint` / `recordAlphaWUValidation` / `recordAlphaWUAcceptance` | Canonicalize α‑Work Unit lifecycle. | Enforces stake checks and provenance for SLU accounting.【F:contracts/AlphaNodeManager.sol†L202-L241】 |
| `applySlash` | Emit deterministic slash events. | Guards zero-amount or unknown-validator slashes.【F:contracts/AlphaNodeManager.sol†L243-L257】 |

## Observability & DoS guardrails

- **Network Resource Manager (NRM)**: Per-protocol/IP/ASN caps, ban grids, and connection watermarks emit structured denials (`nrm_denials_total{limit_type,protocol}`) plus ban gauges/counters so DoS posture is always visible.【F:src/network/resourceManagerConfig.js†L248-L694】【F:src/telemetry/networkMetrics.js†L114-L174】
- **Debug surfaces**: `/debug/resources` returns limits, usage, bans, trims; `/debug/network` exposes reachability timelines, churn, dial successes/failures, and transport posture for any time window.【F:src/network/apiServer.js†L1353-L1552】
- **Prometheus + OTel**: `startMonitoringServer` keeps `/metrics` and OTLP wiring alive; libp2p dial traces and protocol handlers feed latency/volume histograms ready for Grafana overlays.【F:src/telemetry/monitoring.js†L280-L363】【F:src/network/libp2pHostConfig.js†L64-L195】【F:src/network/protocols/metrics.js†L6-L149】
- **Dashboard parity**: The React/Vite cockpit consumes the same debug endpoints to render transport posture, reachability, resource pressure, and churn tiles with zero bespoke wiring.【F:dashboard/src/views/TelemetryView.jsx†L1-L323】【F:dashboard/src/api/client.js†L31-L56】
- **DCUtR punch health kit**: `observability/prometheus/metrics_dcutr.js` defines counters, gauges, histograms, and a `registerDCUtRMetrics` hook with label-aware emitters (`region`, `asn`, `transport`, `relay_id`) so per-relay success stays correlated to topology. Pair it with `observability/grafana/dcutr_dashboard.json` (UID `dcutr-observability`) and the walkthrough in `observability/docs/METRICS.md` + `observability/docs/DASHBOARD.md` to visualize punch success, attempts/success/failures, p95 time-to-direct, relay offload, RTT quality, and the region×ASN heatmap; lint via `grafana dashboards lint observability/grafana/dcutr_dashboard.json` before importing.【F:observability/prometheus/metrics_dcutr.js†L1-L221】【F:observability/grafana/dcutr_dashboard.json†L1-L123】【F:observability/docs/METRICS.md†L1-L120】【F:observability/docs/DASHBOARD.md†L1-L120】
- **One-click DCUtR binding on /metrics**: `startMonitoringServer({ dcutrEvents, libp2p })` now binds relay dial, punch start, direct confirmations, relay fallbacks, and stream migrations to Prometheus in the same registry that powers the node’s `/metrics` endpoint, so Grafana panels stay live even when you feed the bridge a raw EventEmitter instead of the synthetic harness.【F:src/telemetry/monitoring.js†L273-L360】【F:test/monitoring.test.js†L62-L108】

## DCUtR production primer

```mermaid
sequenceDiagram
  autonumber
  participant PeerA as Peer A (behind NAT)
  participant Relay as Relay rendezvous
  participant PeerB as Peer B (behind NAT)
  participant Direct as Direct path

  PeerA->>Relay: Dial via relay (fallback path)
  PeerB->>Relay: Dial via relay
  Relay-->>PeerA: Reachability hints + punch window
  Relay-->>PeerB: Reachability hints + punch window
  PeerA-->>PeerB: Timed UDP/TCP punches (QUIC-preferred)
  PeerB-->>PeerA: Timed UDP/TCP punches (QUIC-preferred)
  PeerA-->>Direct: Probe & confirm best path
  PeerB-->>Direct: Probe & confirm best path
  Direct-->>Relay: Tear down relay (keep as backup if desired)
```

- **Why it matters**: DCUtR (Direct Connection Upgrade through Relay) lets two NATed peers meet on a relay, coordinate a punch, and shift traffic to a direct path for lower latency, lower cost, and higher throughput.
- **SLOs to watch**: punch success rate (global and by `region × asn × transport`), time-to-direct p50/p95, relay offload %, direct path quality vs relay baseline, fallback rate, and relay cost per GB.
- **Typical failure modes**: symmetric NATs or strict firewalls, punch-window jitter or clock drift, mismatched transports (UDP blocked), and relay policy limits or reservation expiry.
- **Fast wins**: prefer QUIC/UDP with TCP fallback, tune punch windows to observed RTTs, colocate relays near users, cache observed addresses with short TTLs, and maintain a small diverse relay set.
- **Playbook when graphs dip**: scope impact (global vs single region/AS), check transport split (QUIC blocks → flip to TCP), validate relay reservations/limits, review recent timing changes, and run Punchr-style canaries before rolling forward.
- **Config hints**: enable AutoNAT + AutoRelay, prefer QUIC-first then TCP, keep relay reservations with sane TTL/backoff, and log connection gating decisions for post-mortems.

```mermaid
flowchart LR
  classDef neon fill:#0b1120,stroke:#22c55e,stroke-width:2px,color:#e2e8f0;
  classDef lava fill:#0b1120,stroke:#f97316,stroke-width:2px,color:#ffedd5;
  classDef frost fill:#0b1120,stroke:#0ea5e9,stroke-width:2px,color:#e0f2fe;

  subgraph Punch[DCUtR Punch Lifecycle]
    Start[onPunchStart]:::lava
    Success[onPunchSuccess/onPunchFailure]:::lava
    Quality[onDirectRttMs/onDirectLossRate]:::lava
    Volume[onRelayBytes/onDirectBytes]:::lava
  end

  Start --> Registry
  Success --> Registry
  Quality --> Registry
  Volume --> Registry

  Registry[registerDCUtRMetrics\nPrometheus registry + defaults]:::frost --> Scrape[Prometheus scrape]:::frost
  Scrape --> Grafana[dcutr_dashboard.json\n(p50/p95, success %, offload)]:::neon
  Grafana --> Operator[Operator cockpit + alerts]:::neon
```

```mermaid
sequenceDiagram
  autonumber
  participant A as Peer A (behind NAT)
  participant Relay as Relay
  participant B as Peer B (behind NAT)
  participant Direct as Direct Path

  A->>Relay: Dial via reservation
  Relay-->>B: Introduce peers
  A->>B: Coordinate punch window
  B-->>A: Exchange observed addrs + transports
  A-->>Direct: Timed punches (QUIC-first, TCP fallback)
  B-->>Direct: Timed punches (mirrored)
  Direct-->>A: Direct RTT/quality stream
  Direct-->>B: Direct RTT/quality stream
  Relay-->>Relay: Tear down or stay warm as backup
```

## DCUtR metrics sprint (drop-in)

The sprint artifacts live under `observability/` and are wired to render cleanly on GitHub (Mermaid + badges) and in Grafana. They align the repo layout with the DCUtR primer above.

- **File map**: Prometheus wiring (`observability/prometheus/metrics_dcutr.js`), Grafana dashboard (`observability/grafana/dcutr_dashboard.json`), provisioning bundle (`grafana/provisioning/dashboards/dcutr.yaml`), and operator notes (`observability/docs/METRICS.md`, `observability/docs/DASHBOARD.md`).【F:observability/prometheus/metrics_dcutr.js†L1-L221】【F:observability/grafana/dcutr_dashboard.json†L1-L123】【F:grafana/provisioning/dashboards/dcutr.yaml†L1-L6】【F:observability/docs/METRICS.md†L1-L120】【F:observability/docs/DASHBOARD.md†L1-L120】
- **Metrics declared**: attempts/success/failure, computed success rate, time-to-direct histogram, RTT + loss gauges, relay fallback/offload counters, relay vs direct byte counters (all label-aware, deduped across relay + punch start events).【F:observability/prometheus/metrics_dcutr.js†L45-L105】【F:src/observability/dcutrEvents.js†L36-L134】
- **Success-rate guardrail**: `dcutr_punch_success_rate` derives from attempts/successes during collection, pinning zero attempts to `0` while respecting each label set to keep Grafana/Prometheus panels stable even under startup jitter.【F:observability/prometheus/metrics_dcutr.js†L106-L136】
- **Emitters**: `onPunchStart`, `onPunchSuccess`, `onPunchFailure`, `onPunchLatency`, `onDirectRttMs`, `onDirectLossRate`, `onRelayFallback`, `onRelayOffload`, `onRelayBytes`, `onDirectBytes` (all tested under `test/observability/metrics_dcutr.test.ts`).【F:observability/prometheus/metrics_dcutr.js†L173-L221】【F:test/observability/metrics_dcutr.test.ts†L1-L123】
- **Owner-ops quickstart**: register once and expose `/metrics`:

  ```ts
  import { registerDCUtRMetrics, onPunchStart, onPunchSuccess, onPunchFailure } from './observability/prometheus/metrics_dcutr.js';

  registerDCUtRMetrics();
  const labels = { region: 'us-east', asn: 'as16509', transport: 'quic', relay_id: '12D3KooW...' };

  onPunchStart(labels);
  onPunchSuccess(labels);
  onPunchFailure(labels);
  ```

- **Live libp2p binding**: attach the bridge to any libp2p node that emits `hole-punch:*` + `relay:*` signals and keep the harness running alongside without double-counting:

  ```ts
  import { wireLibp2pDCUtRMetrics } from './src/observability/dcutrEvents.js';
  import { registerDCUtRMetrics } from './observability/prometheus/metrics_dcutr.js';

  registerDCUtRMetrics();
  const detachMetrics = wireLibp2pDCUtRMetrics(libp2pInstance);
  // later: detachMetrics();
  ```

- **Phase 5 verification loop (local + synthetic)**:
  1. Launch the synthetic generator with success/failure mix, dynamic RTT, and relay simulation: `npm run observability:dcutr-harness` (emits counters + histograms continuously via `startSyntheticDCUtRGenerator`).【F:scripts/dcutr-harness.ts†L1-L32】【F:src/observability/dcutrHarness.ts†L33-L92】
  2. Spin up observability stack: `docker-compose up prom grafana` mounts `observability/prometheus/prometheus.yml` and auto-imports the DCUtR dashboard through `grafana/provisioning/dashboards/dcutr.yaml` (`/grafana/dashboards` bind).【F:docker-compose.yml†L1-L25】【F:grafana/provisioning/dashboards/dcutr.yaml†L1-L6】
  3. Validate panels live: the success/failure/latency series should populate, the heatmap should respect region×ASN bins, and histogram buckets should render (p50/p95) from `dcutr_time_to_direct_seconds_bucket`. Use Grafana’s “Explore” view to cross-check PromQL against `/metrics` scraped from the harness.

- **Grafana import**: upload `observability/grafana/dcutr_dashboard.json`, point it at your Prometheus datasource, and you instantly get KPI, heatmap, and offload panels sized for production drill-downs.【F:observability/grafana/dcutr_dashboard.json†L1-L123】
- **Phase 3 dashboard layout (stubbed for Grafana 11.x)**:
  - **UID / Title**: `dcutr-observability` · “DCUtR — Hole Punch Performance”.
  - **Panels**: success rate, attempts/success/failures, p95 time-to-direct, relay offload, RTT quality, region×ASN heatmap (PromQL exactly mirrors the sprint brief).【F:observability/grafana/dcutr_dashboard.json†L1-L123】
  - **Datasource**: parameterized `DS_PROMETHEUS` input so imports prompt for your Prometheus instance instead of hard-coding a UID.【F:observability/grafana/dcutr_dashboard.json†L1-L19】【F:observability/grafana/dcutr_dashboard.json†L20-L69】
  - **Lint**: `grafana dashboards lint observability/grafana/dcutr_dashboard.json` (or `npm run lint:grafana`) before shipping to catch structural drift using the same PromQL set you’ll deploy.【F:scripts/lint-grafana-dashboard.mjs†L1-L62】

### DCUtR Grafana panel map (phase 3 stub)

| Panel ID | Title | Type | PromQL target |
| --- | --- | --- | --- |
| 1 | Punch Success Rate | `stat` | `sum(rate(dcutr_punch_success_total[5m])) / sum(rate(dcutr_punch_attempts_total[5m]))` |
| 2 | Punch Attempts / Success / Failures | `timeseries` | `sum(rate(dcutr_punch_attempts_total[5m]))`, `sum(rate(dcutr_punch_success_total[5m]))`, `sum(rate(dcutr_punch_failure_total[5m]))` |
| 3 | Time To Direct (Latency Histogram) | `timeseries` | `histogram_quantile(0.95, sum(rate(dcutr_time_to_direct_seconds_bucket[5m])) by (le))` |
| 4 | Relay Offload | `timeseries` | `sum(rate(dcutr_relay_offload_total[5m]))` |
| 5 | Direct Path Quality (RTT) | `timeseries` | `avg(dcutr_path_quality_rtt_ms)` |
| 6 | Region × ASN Heatmap | `heatmap` | `sum(rate(dcutr_punch_success_total[10m])) by (region, asn)` |

Each panel uses the same Prometheus datasource binding (`${DS_PROMETHEUS}`) to stay environment-agnostic while retaining unique `id` values for linting and alert rule wiring.【F:observability/grafana/dcutr_dashboard.json†L20-L123】【F:scripts/lint-grafana-dashboard.mjs†L1-L62】 Run `npm run lint:grafana` (wraps `grafana dashboards lint`) to verify structure before export; the badge block up top pulls from the same job to keep README and CI in sync.【F:package.json†L14-L21】【F:.github/workflows/ci.yml†L1-L210】

```bash
# Validate the Grafana JSON stub (Phase 3 dashboard)
npm run lint:grafana
# or directly
grafana dashboards lint observability/grafana/dcutr_dashboard.json
```

```mermaid
sequenceDiagram
  autonumber
  participant Libp2p as libp2p host
  participant Bridge as wireLibp2pDCUtRMetrics
  participant Metrics as Prometheus registry
  participant Grafana as DCUtR dashboard
  Libp2p->>Bridge: relay:connect / hole-punch:start
  Bridge->>Metrics: registerDCUtRMetrics + emitters
  Libp2p-->>Bridge: hole-punch:success | hole-punch:failure
  Bridge-->>Metrics: attempt/success/failure + RTT/loss bytes
  Metrics-->>Grafana: scrape /metrics (prom job)
  Grafana-->>Bridge: panels stay live (heatmaps, histograms)
```

```mermaid
flowchart TB
  classDef neon fill:#0b1120,stroke:#22c55e,stroke-width:2px,color:#e2e8f0;
  classDef lava fill:#0b1120,stroke:#f97316,stroke-width:2px,color:#ffedd5;
  classDef frost fill:#0b1120,stroke:#0ea5e9,stroke-width:2px,color:#e0f2fe;

  subgraph PunchLoop[DCUtR punch loop]
    PunchStart[Hole punch start]:::lava --> PunchOutcome[Success / Failure]:::lava
    PunchOutcome --> DirectPath[Direct path quality\nRTT + loss]:::frost
    PunchOutcome --> VolumeFlows[Relay vs direct bytes]:::frost
  end

  PunchLoop --> RegistryF[Prometheus registry\nregisterDCUtRMetrics]:::neon
  RegistryF --> Panels[Grafana panels\np50/p95, success %, offload]:::neon
  Panels --> OwnerOps[Owner cockpit + alerts\n(pause/offload policies)]:::lava
  OwnerOps --> LintCheck[grafana dashboards lint\n + npm run lint:grafana]:::frost
```

## CI wall (always green)

```mermaid
flowchart LR
  classDef job fill:#0b1120,stroke:#22c55e,stroke-width:2px,color:#e2e8f0;
  classDef gate fill:#0b1120,stroke:#f97316,stroke-width:2px,color:#ffedd5;

  Lint[Lint Markdown & Links]:::job --> Verify
  Test[Unit + Frontend Tests]:::job --> Verify
  Solidity[Solidity Lint & Compile]:::job --> Verify
  TS[Subgraph TypeScript Build]:::job --> Verify
  Coverage[Coverage Report\nc8 --check-coverage]:::job --> Verify
  Docker[Docker Build & Smoke]:::job --> Verify
  Security[Dependency Security Scan]:::job --> Badges
  Verify[Full CI Verification\nnpm run ci:verify]:::gate --> Badges[Required Checks on PRs/main]:::gate
```

- `.github/workflows/ci.yml` runs lint, tests (backend + dashboard), coverage enforcement, Solidity lint/compile, subgraph build, docker smoke, audit, and then replays `npm run ci:verify` to mirror the local bar.【F:.github/workflows/ci.yml†L1-L210】
- `.github/required-checks.json` marks every gate as mandatory for PRs and `main`, keeping branch protection aligned with the badges above.【F:.github/required-checks.json†L1-L10】
- `badges` job on `main` publishes shields from CI outputs so the README badges reflect real outcomes and stay in sync with branch protection names.【F:.github/workflows/ci.yml†L261-L340】【F:.github/required-checks.json†L1-L10】
- `npm run ci:verify` bundles all gates locally so contributors see the same wall GitHub enforces.【F:package.json†L19-L46】

**Check map (enforced on PRs + main):**

| GitHub check name | Local command / step | Source |
| --- | --- | --- |
| Lint Markdown & Links | `npm run ci:lint` (markdownlint + link-check + Grafana dashboard lint + policy + branch gate) | 【F:package.json†L14-L34】【F:.github/workflows/ci.yml†L17-L66】 |
| Unit, Integration & Frontend Tests | `npm run ci:test` (backend + dashboard suites) | 【F:package.json†L26-L28】【F:.github/workflows/ci.yml†L60-L80】 |
| Solidity Lint & Compile | `npm run ci:solidity` | 【F:package.json†L23-L30】【F:.github/workflows/ci.yml†L82-L103】 |
| Subgraph TypeScript Build | `npm run ci:ts` | 【F:package.json†L29-L30】【F:.github/workflows/ci.yml†L104-L125】 |
| Coverage Report | `npm run coverage` + c8 gates | 【F:package.json†L21-L22】【F:.github/workflows/ci.yml†L126-L176】 |
| Docker Build & Smoke Test | `docker build` + runtime `--help` smoke | 【F:.github/workflows/ci.yml†L177-L199】 |
| Dependency Security Scan | `npm run ci:security` | 【F:package.json†L31-L32】【F:.github/workflows/ci.yml†L239-L259】 |
| Full CI Verification | `npm run ci:verify` | 【F:package.json†L26-L34】【F:.github/workflows/ci.yml†L201-L236】 |

**Branch protection quickstart:**

```bash
# mirror the required checks from .github/required-checks.json
gh api \
  -X PUT \
  repos/MontrealAI/AGI-Alpha-Node-v0/branches/main/protection \
  -f required_status_checks.strict=true \
  $(jq -r '.required_status_checks[] | @sh "-frequired_status_checks.contexts[]=\(.)"' .github/required-checks.json)
```

- Keep badges green locally with `npm run ci:verify` before opening a PR; GitHub enforces the same matrix using the required ch
ecks payload above.【F:.github/workflows/ci.yml†L1-L210】【F:.github/required-checks.json†L1-L10】

## API surfaces

| Endpoint | Purpose |
| --- | --- |
| `GET /health` / `GET /healthz` | Liveness/readiness probes. |
| `GET /debug/resources` | Limits + usage grid, bans, NRM snapshot (per-protocol/IP/ASN).【F:src/network/apiServer.js†L1353-L1405】 |
| `GET /debug/network` | Reachability timeline, connection churn, dial success/failure, transport posture windows.【F:src/network/apiServer.js†L1409-L1552】 |
| `POST/DELETE /governance/bans` | Add/remove IP/peer/ASN bans (owner token required) with automatic gauges/counters.【F:src/network/apiServer.js†L2050-L2130】 |
| `GET /debug/peerscore` | GossipSub v1.1 peer score summaries for mesh tuning. |
| `GET /metrics` | Prometheus/OTel surface for network, peer scoring, SLU, and index gauges. |

## Run it locally

```bash
npm ci
npm run ci:verify   # lint, tests, coverage, solidity, subgraph, audit, policy, branch gate
npm start           # REST + metrics + governance surfaces with SQLite migrations
```

Additional entry points: `npm run p2p:simulate` (1k+ virtual peers), `npm run dashboard:dev` (React/Vite cockpit), and `npm run p2p:load-tests` (abuse harness with `/debug/resources` + peer-score/trim assertions).【F:package.json†L10-L58】【F:scripts/p2p-simulator.mjs†L1-L118】【F:test/network/loadHarness.observability.test.js†L1-L108】

### Operations playbook

1. **Install & hydrate**: `npm ci && npm run db:migrate && npm run db:seed` to prime the SQLite spine and dashboards.
2. **Boot**: `npm start` (or `npm run dashboard:preview`) to expose `/health`, `/metrics`, `/debug/resources`, and governance surfaces on port 3000.
3. **Observe**: `curl -s localhost:3000/metrics | head` to confirm NRM/ban/trim counters; `curl -s localhost:3000/debug/resources` for per-protocol ceilings/bans; `curl -s localhost:3000/debug/network?window=15` for reachability, churn, and dial health.
4. **Govern**: Use authenticated `POST/DELETE /governance/bans` or `node src/index.js governance:*` to pause/unpause, rotate validators, or retune emissions without redeploying.
5. **Harden**: Enforce branch protection with `.github/required-checks.json` and mirror CI locally via `npm run ci:verify` before opening PRs.

```mermaid
sequenceDiagram
  autonumber
  participant Operator as Operator / Owner
  participant Node as AGI Alpha Node
  participant Metrics as Prometheus / OTel
  participant Governance as Governance API + CLI

  Operator->>Node: npm ci && npm start
  Node-->>Metrics: nrm_denials_total / connmanager_trims_total / banlist_*
  Operator->>Node: curl /debug/resources (caps + usage + bans)
  Operator->>Governance: POST /governance/bans (ip/peer/asn)
  Governance-->>Node: ban grid updated + gauges/counters set
  Operator->>Governance: governance:* (pause/unpause/retune)
  Node-->>Operator: health OK + enforcement active
```

## Deployment paths

- **Docker**: `docker build -t agi-alpha-node:latest .` then `docker run --rm -p 3000:3000 agi-alpha-node:latest --help` to validate binaries before promotion.【F:Dockerfile†L1-L28】
- **Helm**: `helm upgrade --install agi-alpha-node deploy/helm/agi-alpha-node -f deploy/helm/agi-alpha-node/values.yaml` to roll out with PR-enforced checks and metrics already wired.【F:deploy/helm/agi-alpha-node/values.yaml†L1-L153】
- **Bare metal**: `npm ci && npm start` with `NRM_*` and `CONN_*` env vars tuned for your topology; `/debug/resources` remains stable across modes.【F:src/network/apiServer.js†L1353-L1405】

```mermaid
flowchart LR
  classDef neon fill:#0b1120,stroke:#22c55e,stroke-width:2px,color:#e2e8f0;
  classDef lava fill:#0b1120,stroke:#f97316,stroke-width:2px,color:#ffedd5;
  classDef frost fill:#0b1120,stroke:#0ea5e9,stroke-width:2px,color:#e0f2fe;

  Source[Main branch\nPR-protected]:::lava --> CI[CI pipeline\n(all gates)]:::frost
  CI --> Image[Docker image\nbuilt from Dockerfile]:::neon
  CI --> Chart[Helm chart\nvalues.yaml overrides]:::frost
  Image --> Cluster[Kubernetes release]:::lava
  Chart --> Cluster
  Cluster --> Telemetry[Prometheus/OTel\n/metrics & /debug/resources]:::neon
  Cluster --> GovernanceAPI[Owner commands\n/governance/*]:::lava
  Telemetry --> Operator[Dashboards + CLI]:::frost
```

## Validation & tests

- `npm test -- test/treasury/intentEncoding.test.ts` — proves ABI encoding/digest parity with Solidity harness.【F:test/treasury/intentEncoding.test.ts†L1-L114】
- `npm test -- test/treasury/pqEnvelope.test.ts` — guards CBOR serialization of PQ envelopes.【F:test/treasury/pqEnvelope.test.ts†L1-L41】
- `npm test -- test/treasury/thresholdAggregator.test.ts` — enforces unique guardians, parameter sets, and replay flags before execution.【F:test/treasury/thresholdAggregator.test.ts†L1-L206】
- `npm test -- test/treasury/modeA.integration.test.ts` — end-to-end guardian keygen → Dilithium envelopes → threshold aggregation → treasury execution inside an EthereumJS VM with real intent hashes.【F:test/treasury/modeA.integration.test.ts†L1-L196】
- `npm test -- test/treasury/envelopeCollector.test.ts` — validates the drop-zone loader diagnostics.【F:test/treasury/envelopeCollector.test.ts†L1-L49】
- `npm test -- test/treasury/intentLedger.test.ts` — confirms persistence + replay shielding for executed digests.【F:test/treasury/intentLedger.test.ts†L1-L41】
- Mode A manual smoke: `npm run treasury:execute -- --help` drives envelope verification + ethers dispatch against a local Anvil/Hardhat treasury using CBOR signatures emitted by `npm run treasury:sign`; see the guardian runbook for envelope prep.【F:scripts/treasury/execute-intent.ts†L1-L203】【F:scripts/treasury/sign-intent.ts†L1-L169】【F:docs/runes/guardian.md†L1-L120】
- `npm test -- test/observability/metrics_dcutr.test.ts` — validates the DCUtR Prometheus stub (registration, punch lifecycle emitters, success-rate gauge, latency histogram) so dashboards stay trustworthy.【F:test/observability/metrics_dcutr.test.ts†L1-L123】【F:observability/prometheus/metrics_dcutr.js†L1-L221】
- `npm run ci:verify` — full badge-backed CI wall (lint, tests, coverage, Solidity, subgraph, audit, policy, branch gates).【F:package.json†L19-L46】【F:.github/workflows/ci.yml†L1-L210】

## Runbooks & references

- Guardian onboarding + signing: [`docs/runes/guardian.md`](docs/runes/guardian.md)
- Orchestrator execution (Mode A): [`docs/runes/orchestrator.md`](docs/runes/orchestrator.md)
- Mode A flow, envelope schema, orchestrator steps: [`docs/treasury-mode-a.md`](docs/treasury-mode-a.md)
- Network operations (reachability, DoS triage, posture flips): [`docs/network-operations.md`](docs/network-operations.md)
- Economics & identity background: [`docs/economics.md`](docs/economics.md), [`docs/identity.md`](docs/identity.md), [`docs/manifesto.md`](docs/manifesto.md)
- DCUtR metrics and dashboard import: [`observability/docs/METRICS.md`](observability/docs/METRICS.md), [`observability/docs/DASHBOARD.md`](observability/docs/DASHBOARD.md)

## Phase 2 documentation stubs

The DCUtR sprint now ships with self-contained documentation under `observability/docs` so operators can wire metrics and dashboards without bespoke knowledge transfer.

```mermaid
flowchart LR
  classDef neon fill:#0b1120,stroke:#22c55e,stroke-width:2px,color:#e2e8f0;
  classDef lava fill:#0b1120,stroke:#f97316,stroke-width:2px,color:#ffedd5;
  classDef frost fill:#0b1120,stroke:#0ea5e9,stroke-width:2px,color:#e0f2fe;

  MetricsStub[METRICS.md\n(label schema + emitters) ]:::lava --> Prom[Prometheus scrape\n/metrics stays stable]:::frost
  DashStub[DASHBOARD.md\npanel-by-panel guide + placeholder]:::neon --> Grafana[Grafana import\n`dcutr_dashboard.json`]:::lava
  Prom --> Grafana
  Grafana --> Ops[Ops & Owner cockpit\nalerts, offload policy]:::frost
```

- **METRICS.md** — declares the `region/asn/transport/relay_id` label set, per-metric semantics, and code snippets for registering emitters. It stays in lockstep with `observability/prometheus/metrics_dcutr.js` so CI and Grafana panels agree.【F:observability/docs/METRICS.md†L1-L99】【F:observability/prometheus/metrics_dcutr.js†L1-L221】
- **DASHBOARD.md** — walks through every panel, keeps a screenshot placeholder, and mirrors the README primer so Grafana imports are predictable and mermaid renders cleanly on GitHub.【F:observability/docs/DASHBOARD.md†L1-L120】【F:observability/grafana/dcutr_dashboard.json†L1-L123】


This repository is engineered as the operator-owned intelligence engine that bends economic gravity without sacrificing control: post-quantum approvals off-chain, inexpensive on-chain execution, omnipresent telemetry, and a CI wall that keeps every surface green before code reaches `main`.
