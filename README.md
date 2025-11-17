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
  <a href="https://github.com/MontrealAI/AGI-Alpha-Node-v0/actions/workflows/ci.yml?query=branch%3Amain">
    <img src="https://img.shields.io/github/actions/workflow/status/MontrealAI/AGI-Alpha-Node-v0/ci.yml?branch=main&logo=github&logoColor=white&label=PR%20Protection" alt="PR protection" />
  </a>
  <a href="https://github.com/MontrealAI/AGI-Alpha-Node-v0/actions/workflows/ci.yml?query=branch%3Amain">
    <img src="https://img.shields.io/github/checks-status/MontrealAI/AGI-Alpha-Node-v0/main?logo=github&label=Checks%20on%20main" alt="Branch checks" />
  </a>
  <a href=".github/required-checks.json">
    <img src="https://img.shields.io/badge/Required%20Checks-Enforced%20on%20PRs-8b5cf6?logo=github" alt="Required PR checks" />
  </a>
  <a href="https://github.com/MontrealAI/AGI-Alpha-Node-v0/actions?query=branch%3Amain">
    <img src="https://img.shields.io/badge/Checks-Visible%20in%20GitHub-0ea5e9?logo=github" alt="Checks visibility" />
  </a>
  <img src="https://img.shields.io/badge/Coverage-c8%20enforced-22c55e?logo=testinglibrary&logoColor=white" alt="Coverage" />
  <img src="https://img.shields.io/badge/Test%20Matrix-vitest%20%7C%20solc%20%7C%20markdownlint-22c55e?logo=vitest&logoColor=white" alt="Test matrix" />
  <img src="https://img.shields.io/badge/Security-npm%20audit%20%7C%20health%20gates-ef4444?logo=npm&logoColor=white" alt="Security gates" />
  <img src="https://img.shields.io/badge/Public%20API-Read--only%20%7C%20CORS-22c55e?logo=fastapi&logoColor=white" alt="Public API" />
  <img src="https://img.shields.io/badge/Internal%20Dashboard-React%20%7C%20Vite-38bdf8?logo=react&logoColor=white" alt="Dashboard" />
  <img src="https://img.shields.io/badge/Debug%20Surface-Telemetry%20%7C%20GSLI-0ea5e9?logo=prometheus&logoColor=white" alt="Debug surface" />
  <img src="https://img.shields.io/badge/Index%20Engine-GSLI%20Rebalancing-10b981?logo=apacheairflow&logoColor=white" alt="Index engine" />
  <a href="https://etherscan.io/address/0xa61a3b3a130a9c20768eebf97e21515a6046a1fa">
    <img src="https://img.shields.io/badge/$AGIALPHA-0xa61a...a1fa-ff3366?logo=ethereum&logoColor=white" alt="$AGIALPHA" />
  </a>
  <img src="https://img.shields.io/badge/Token%20Decimals-18%20dp-f97316?logo=ethereum&logoColor=white" alt="Token decimals" />
  <a href="LICENSE">
    <img src="https://img.shields.io/badge/License-MIT-111827?logo=open-source-initiative&logoColor=white" alt="License" />
  </a>
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
  <img src="https://img.shields.io/badge/Public%20Surface-REST%20%7C%20Metrics%20%7C%20ENS-14b8a6?logo=protocols.io&logoColor=white" alt="Surface area" />
  <img src="https://img.shields.io/badge/Dashboard-Mockable%20%7C%20API--key%20aware-14b8a6?logo=react&logoColor=white" alt="Dashboard status" />
  <img src="https://img.shields.io/badge/Health-%2Fhealth%20%2B%20%2Fhealthz-22c55e?logo=sthealth" alt="Health endpoints" />
  <img src="https://img.shields.io/badge/Logs-Structured%20pino%20events-0ea5e9?logo=buffer" alt="Structured logs" />
  <img src="https://img.shields.io/badge/Metrics-Prometheus%20%7C%20OTel-10b981?logo=prometheus&logoColor=white" alt="Metrics surfaces" />
</p>

> **AGI Alpha Node v0** metabolizes heterogeneous agentic labor into verifiable α‑Work Units (α‑WU) and Synthetic Labor Units (SLU), rebalances the Global Synthetic Labor Index (GSLI), exposes audited read‑only REST telemetry, and routes the `$AGIALPHA` treasury (token: `0xa61a3b3a130a9c20768eebf97e21515a6046a1fa`, 18 decimals) under complete owner command. Every dial can be paused, rerouted, or retuned without redeploying, delivering a production-grade intelligence core built to bend markets.
> New for this sprint: a React/Vite single-page dashboard (Index | Providers | Telemetry Debug), live GSLI and SLU charts backed by `/index/history` and `/providers/*/scores`, and a telemetry stream reader at `/telemetry/task-runs` that keeps ingest visibility tight while remaining API-key gated for operators.
> The runtime is tuned to operate like an ever-watchful macro trader—autonomous by default, yet instantly steerable by the contract owner to seize new parameters, pause subsystems, or redirect emissions without friction.
> **Operational promise**: CI is fully green by default and enforced on PRs/main via `.github/required-checks.json`, with badges wired to the canonical workflow. The same gates run locally with `npm run ci:verify`, giving non-technical operators parity with branch protection before they ship.
>
> **Transport & NAT sprint**: QUIC-first transport with TCP fallback, DCUtR hole punching, AutoNAT reachability-driven address advertisement, and Relay v2 quotas are now wired through `TRANSPORT_*`, `ENABLE_HOLE_PUNCHING`, `AUTONAT_*`, and `RELAY_*` environment toggles. Dial attempts are ordered toward QUIC where available, address announcements respect public/private posture, and relay slots/bandwidth remain capped for resilience. Logs surface reachability and transport choice so operators can verify QUIC-only, TCP-only, or mixed neighborhoods before rollout.
>
> 🛰️ **Launch pad (non-technical operator)**
>
> 1. **Install & verify**: `npm ci && npm run ci:verify` (mirrors branch protection locally and surfaces any dependency or Solidity drift).
> 2. **Bring the node up**: `npm start` (reads `.env`, bootstraps SQLite, read-only REST, metrics, governance API, and ENS/owner alignment).
> 3. **Open the cockpit**: `npm run dashboard:dev` (or `npm run dashboard:preview` after `npm run dashboard:build`) and point the connection bar to your API base + key. Data hydrates live—no rebuilds required.
> 4. **Own every dial**: Use `node src/index.js governance:*` verbs or authenticated `/governance/*` calls to pause/unpause, rotate validators, reroute emissions/treasury, refresh metadata, and retune productivity without redeploying.
> 5. **Confirm green**: Badges below reflect GitHub Actions visibility plus `.github/required-checks.json` enforcement; CI stays visible and required on PRs and `main`.
>

## Orientation & quick links

- **One-command proof**: `npm run ci:verify` mirrors the full PR gate locally (lint, tests, coverage, solidity, subgraph TS, security, policy, branch gate).
- **CI visibility**: [Workflow dashboard](https://github.com/MontrealAI/AGI-Alpha-Node-v0/actions/workflows/ci.yml) + [required checks manifest](.github/required-checks.json) keep enforcement transparent.
- **Owner sovereignty**: Governance verbs live in `src/index.js` and calldata builders in `src/services/governance.js`, pointed at the canonical `$AGIALPHA` token (`0xa61a3b3a130a9c20768eebf97e21515a6046a1fa`).
- **Debug deck (SPA)**: `dashboard/` ships a React/Vite cockpit with a connection bar (API base + API key), per-tab refresh, and mocked smoke coverage via `dashboard/src/App.test.jsx`.
- **Deploy fast**: `Dockerfile` + `deploy/helm/agi-alpha-node` emit production images and Kubernetes charts; defaults remain non-destructive for non-technical operators.
- **Health & observability**: `/health` + `/healthz` for probes, `/metrics` for Prometheus, structured pino logs for SLU scoring + GSLI rebalance, and `.env.example` wiring for API keys, DB path (`AGI_ALPHA_DB_PATH`), and dashboard CORS in one place.

### Transport + NAT traversal architecture (Sprint A)

- **QUIC-first, TCP-ready**: `buildTransportConfig` keeps both stacks enabled by default and orders dial targets toward QUIC with TCP fallback so restrictive networks still connect.【F:src/network/transportConfig.js†L22-L101】【F:src/network/transportConfig.js†L115-L146】
- **Libp2p host descriptor**: `buildLibp2pHostConfig` consumes env/CLI/ENS inputs (`P2P_LISTEN_MULTIADDRS`, `P2P_PUBLIC_MULTIADDRS`, `P2P_RELAY_MULTIADDRS`, `P2P_LAN_MULTIADDRS`, `TRANSPORT_*`, `ENABLE_HOLE_PUNCHING`, `AUTONAT_*`, `RELAY_*`) and emits the exact host wiring: registered transports, dial preference, announce set (reachability-aware), DCUtR, AutoNAT throttle, and Relay v2 quotas.【F:src/network/libp2pHostConfig.js†L1-L84】
- **Operator toggles** (all hot-reloadable via `.env`/CLI):
  - `TRANSPORT_ENABLE_QUIC` / `TRANSPORT_ENABLE_TCP` (default both true) with deterministic QUIC-first dialer.
  - `ENABLE_HOLE_PUNCHING` (DCUtR), `AUTONAT_ENABLED` + `AUTONAT_THROTTLE_SECONDS` (reachability probes), and `RELAY_ENABLE_CLIENT` / `RELAY_ENABLE_SERVER` with `RELAY_MAX_RESERVATIONS`, `RELAY_MAX_CIRCUITS_PER_PEER`, `RELAY_MAX_BANDWIDTH_BPS`.
  - Address feeds: `P2P_LISTEN_MULTIADDRS` (binds), `P2P_PUBLIC_MULTIADDRS` (manual overrides in addition to ENS), `P2P_RELAY_MULTIADDRS` (bootstrappable relays), `P2P_LAN_MULTIADDRS` (for private posture announce set).【F:src/config/defaults.js†L17-L39】【F:src/config/schema.js†L43-L79】
  - `AUTONAT_REACHABILITY` hint can pin announce posture in constrained labs (otherwise AutoNAT derives it).
- **DCUtR + AutoNAT**: Hole punching, reachability probes, and throttle windows are env-driven; reachability is normalised to `public | private | unknown` and fed into address advertisement to avoid leaking unroutable endpoints.【F:src/network/transportConfig.js†L30-L43】【F:src/network/transportConfig.js†L148-L187】
- **Relay v2 quotas**: Client/server toggles, reservation ceilings, per-peer circuit caps, and optional bandwidth ceilings keep relayed paths available without becoming a DoS sink.【F:src/network/transportConfig.js†L34-L54】
- **Announce + dial clarity**: Multiaddrs are deduped, reachability-aware, and logged. Dial attempts surface their transport preference, enabling manual QUIC-only/TCP-only/mixed verification during rollouts.【F:src/network/transportConfig.js†L103-L113】【F:src/network/transportConfig.js†L115-L146】

```mermaid
flowchart TD
  Env[.env / CLI
  TRANSPORT_*, ENABLE_HOLE_PUNCHING,
  AUTONAT_*, RELAY_*] --> Plan[buildTransportConfig
  QUIC-first plan]
  Plan --> Dialer[rankDialableMultiaddrs
  QUIC-first dial ordering]
  Plan --> HolePunch[DCUtR enabled
  when configured]
  Plan --> AutoNAT[AutoNAT probes
  throttle aware]
  Plan --> Relay[Relay v2 client/server
  quotas + bandwidth caps]
  AutoNAT --> Reachability[Reachability: public/private/unknown]
  Reachability --> Announce[selectAnnounceableAddrs
  (public vs relay/LAN)]
  Announce --> Peers[Peers receive dialable set]
  Plan --> HostConfig[buildLibp2pHostConfig
  (listen/announce/nat/relay)]
  HostConfig --> ObservabilityHost[per-connection transport logs]
  Dialer --> Connections[Connections logged with
  transport used]
  classDef accent fill:#0b1120,stroke:#38bdf8,stroke-width:1.5px,color:#cbd5e1;
  class Env,Plan,Dialer,HolePunch,AutoNAT,Relay,Reachability,Announce,Peers,Connections,HostConfig,ObservabilityHost accent;
```

```mermaid
flowchart LR
  subgraph HostPlan[Host wiring]
    Pref[QUIC-first dialer]
    TCP[tcp transport]
    QUIC[quic transport]
    DCUtR[Hole punching]
    AN[AutoNAT throttle]
    Relay[Relay v2 quotas]
  end
  subgraph Addrs[Addresses]
    Listen[P2P_LISTEN_MULTIADDRS]
    Announce[Announce set by reachability]
  end
  subgraph Signals[Signals & Logs]
    Reach[Reachability hint]
    Log[libp2p host config log]
  end
  Pref --> QUIC
  Pref --> TCP
  QUIC --> DCUtR
  TCP --> DCUtR
  DCUtR --> AN
  AN --> Relay
  Relay --> Announce
  Listen --> Pref
  Announce --> Log
  Reach --> Announce
  Log --> Reach
  classDef accent fill:#0b1120,stroke:#38bdf8,stroke-width:1.5px,color:#cbd5e1;
  class HostPlan,Pref,TCP,QUIC,DCUtR,AN,Relay,Addrs,Listen,Announce,Signals,Reach,Log accent;
```

```mermaid
flowchart LR
  subgraph Observability[Observability & Safety Mesh]
    Health[/GET /health | /healthz/]
    Metrics[/GET /metrics/]
    Logs[pino JSON logs]
    Gate[Health Gate]
  end
  subgraph Runtime[Runtime]
    Jobs[Telemetry ingest & SLU scoring]
    Index[GSLI rebalance]
  end
  Jobs -- structured events --> Logs
  Index -- gauges/counters --> Metrics
  Runtime --> Health
  Gate --> Metrics
  Gate --> Logs
  classDef accent fill:#0b1120,stroke:#22c55e,stroke-width:1.5px,color:#e2e8f0;
  class Observability,Runtime,Health,Metrics,Logs,Gate,Jobs,Index accent;
```

```mermaid
flowchart LR
  subgraph PR_Gate[Protected branch & PR gate]
    Lint[Markdown + link lint]
    Tests[Unit + integration + dashboard smoke]
    Coverage[C8 coverage export]
    Sol[Solhint + solc compile]
    Subgraph[TypeScript codegen + build]
    Security[npm audit (prod deps)]
    Policy[Health gate]
  end
  Dev[Local \n`npm run ci:verify`] --> PR_Gate
  PR_Gate --> Shields[Visible GitHub checks + badge]
  Shields --> Main[Branch protection enforced on main]
  classDef accent fill:#0b1120,stroke:#c084fc,stroke-width:1.5px,color:#e0e7ff;
  class Dev,PR_Gate,Shields,Main,Lint,Tests,Coverage,Sol,Subgraph,Security,Policy accent;
```

```mermaid
flowchart TD
  Repo[(Repo surfaces)] --> Code[src/\ncontracts/\ndeploy/helm]
  Repo --> SPA[dashboard/]
  Repo --> Docs[docs/ + README]
  Code --> Pipelines[CI gates]
  SPA --> Pipelines
  Pipelines --> PRs[PR enforcement\n(branch protected)]
  PRs --> Release[Main / Deployable images]
  classDef accent fill:#0b1120,stroke:#38bdf8,stroke-width:1.5px,color:#cbd5e1;
  class Repo,Code,SPA,Docs,Pipelines,PRs,Release accent;
```

## Executive flash

- **Owner-first sovereignty**: `contracts/AlphaNodeManager.sol` plus CLI verbs in `src/index.js` keep pausing, validator rotation, emissions, treasury routing, productivity bindings, registry upgrades, and metadata under owner control with calldata builders in `src/services/governance.js`. The owner can pause/unpause, reroute flows, rotate validators, and retune meters at will—without redeploying.
- **Read-only public API**: `/index/latest`, `/index/history`, `/providers`, and `/providers/{id}/scores` publish GSLI and provider metrics with optional API-key gating (`X-API-Key` or `Authorization: Bearer`), paginated windows, and CORS allowlisting for dashboards.
- **Telemetry spine**: Schema-validated ingest with hashed API keys, idempotent task-run recording, and Prometheus/OTel export keeps dashboards, subgraphs, and policies aligned.
- **Deterministic persistence**: SQLite migrations + seeds hydrate providers, SLU scores, and index values with indices tuned for provider/day lookups.
- **Deployment-ready**: Dockerfile + Helm chart, CI gates, and seeded CLIs make it deployable by non-specialists while remaining fully operator-tunable.
- **Surface clarity**: Public REST, metrics, and ENS/identity surfaces are split but coherent; dashboards can be locked behind CORS and API-key gates while owner-only governance remains private.

Every control surface above is architected so the owner can reshape incentives, pause workloads, and retune telemetry without redeploying—the machine stays adaptable while preserving sovereignty over emissions, registry entries, and runtime posture.

## Repository atlas (systems map)

- `src/`: API server, governance ledger, telemetry ingest, staking/governance builders, and operator CLIs.
- `contracts/`: Solidity sources including `AlphaNodeManager.sol` with owner-controlled pausing, validator rotation, registry management, staking, slashing, and `$AGIALPHA` routing.
- `dashboard/`: React/Vite single-page cockpit with connection-aware tabs for Index, Providers, and Telemetry debug plus jsdom smoke tests.
- `deploy/helm/agi-alpha-node`: Kubernetes chart for production rollouts; `Dockerfile` for containerized ops.
- `docs/`: Economics, identity, and manifesto references; README is the canonical operational map.
- `subgraph/`: TypeScript tooling for the indexing graph; compiled during CI via `npm run ci:ts`.
- `scripts/`: CI gates (health + branch), Docker smoke harness, ENS helpers, badge publishers, and safety rails invoked by `ci.yml`.

```mermaid
flowchart LR
  subgraph Runtime[Runtime & Governance]
    API[src/network/apiServer.js]
    Gov[src/services/governance.js]
    Ledger[src/persistence]
  end
  subgraph Frontend[Debug Deck]
    SPA[dashboard/src]
    Smoke[test/dashboard.app.test.jsx]
  end
  subgraph Infra[Deployment]
    Dockerfile
    Helm[deploy/helm/agi-alpha-node]
  end
  Gov --> Contracts[contracts/AlphaNodeManager.sol]
  API --> SPA
  SPA --> Smoke
  API --> Infra
  classDef accent fill:#0f172a,stroke:#9333ea,stroke-width:1.5px,color:#e2e8f0;
  class Runtime,Frontend,Infra,Contracts,API,Gov,Ledger,SPA,Smoke,Dockerfile,Helm accent;
```

### Configuration, secrets, and operator ergonomics

- **Environment-first**: copy `.env.example` to `.env` (or inject env vars into Docker/Kubernetes) to control RPC URLs, ENS domains, DB path (`AGI_ALPHA_DB_PATH`), API read keys, CORS (`API_DASHBOARD_ORIGIN`), OpenTelemetry exporters, health gate allowlist, and canonical `$AGIALPHA` binding (`0xa61a3b3a130a9c20768eebf97e21515a6046a1fa`, 18 decimals).
- **Dashboard pairing**: a minimal `dashboard/.env.example` ships alongside the SPA so operators can drop in an API base URL and read key without hunting through config. Copy it to `dashboard/.env.local` when you want the cockpit pointed at a staging or production node.
- **Connectivity levers**: QUIC/TCP biasing, DCUtR hole punching, AutoNAT probing cadence, and Circuit Relay quotas are env-driven (`TRANSPORT_ENABLE_QUIC`, `TRANSPORT_ENABLE_TCP`, `ENABLE_HOLE_PUNCHING`, `AUTONAT_ENABLED`, `AUTONAT_THROTTLE_SECONDS`, `RELAY_ENABLE_*`, `RELAY_MAX_*`, `RELAY_MAX_BANDWIDTH_BPS`) so operators can shape reachability without code edits.
- **Profiles**: `NODE_ROLE` toggles orchestrator/executor/validator/mixed, while `JOB_REGISTRY_PROFILE`, staking shares, and registry overrides allow per-environment behavior without code edits.
- **Secrets hygiene**: never commit `.env`; the Helm chart and Docker image honor the same knobs, and CI redacts secrets. API keys live in `API_PUBLIC_READ_KEY` and `GOVERNANCE_API_TOKEN`, and the governance ledger root is configurable for air-gapped exports.
- **Owner sovereignty preserved**: contract owner can pause/unpause, rotate validators, reroute emissions/treasury, retune divisors, and refresh metadata through `src/index.js` CLI verbs or the authenticated `/governance/*` surface—every parameter stays mutable by the owner without redeploying.

```mermaid
flowchart LR
  subgraph Config[Env-driven config]
    CoreEnv[.env \n RPC_URL, API_PORT, DB path, AGIALPHA binding]
    DashEnv[dashboard/.env.local \n VITE_API_BASE_URL, VITE_PUBLIC_API_KEY]
  end
  subgraph Runtime[Node surfaces]
    API[/REST + governance/]
    Metrics[/Prometheus/]
    Logs[/Structured pino events/]
  end
  CoreEnv --> Runtime
  DashEnv --> UI[Dashboard cockpit]
  UI --> API
  Runtime --> Ops[Non-technical operator]
  classDef accent fill:#0b1120,stroke:#c084fc,stroke-width:1.5px,color:#e0e7ff;
  class Config,Runtime,API,Metrics,Logs,UI,Ops accent;
```

### CI, branch protection, and delivery hygiene

- **Every push gated**: GitHub Actions runs lint (`markdownlint` + link-check + policy gate), backend + dashboard tests, coverage export, Solidity lint/compile, subgraph TS build, Docker build smoke, and npm audit on pushes and PRs. Required checks are enumerated in [`.github/required-checks.json`](.github/required-checks.json) and enforced on `main` via branch protection.
- **Local parity**: `npm run ci:verify` mirrors the PR gate, including health and branch policies, so non-technical operators can see the same signals as GitHub before opening a PR.
- **Badges & visibility**: CI badges at the top of this README and the workflow dashboard ([actions/workflows/ci.yml](https://github.com/MontrealAI/AGI-Alpha-Node-v0/actions/workflows/ci.yml)) expose real-time status; badge publishing is driven by `scripts/publish-badges.mjs` after all checks pass on `main`.
- **Coverage discipline**: `npm run coverage` emits c8 reports and uploads artifacts; thresholds are visible in badges and align with branch protection.

### Observability & health contract

- **Health probes**: `/health` and `/healthz` return readiness/liveness plus health gate posture for load balancers and orchestrators.
- **Metrics**: `/metrics` exposes Prometheus counters/gauges for health gates, index pipeline, telemetry ingest, and governance events; OpenTelemetry exporters are wired via `ALPHA_NODE_OTEL_*` env vars.
- **Structured logging**: pino emits JSON logs across scoring, index jobs, governance, and bootstrap so operators can ship logs to any collector.
- **Diagnostics loop**: the health gate (`src/services/healthGate.js`) ingests ENS allowlists, staking diagnostics, and operator posture; telemetry gauges in `src/telemetry/monitoring.js` surface its state.

#### Health & telemetry quickstart

- Probe liveness/readiness: `curl -s http://localhost:8080/health | jq` (mirrors `/healthz`).
- Inspect metrics: `curl -s http://localhost:8080/metrics | head -n 40` to confirm scrape targets and gate posture are emitted.
- Tail structured logs: `npm start 2>&1 | jq '.'` to see `event`, `component`, and health-gate annotations suitable for SIEM ingestion.
- Enforce gateway posture locally: `npm run ci:policy` keeps the allowlist and diagnostics contract intact before shipping.

```mermaid
sequenceDiagram
  participant Probe as GET /health(z)
  participant API as API Server
  participant Gate as Health Gate
  participant Metrics as Prometheus Surface
  Probe->>API: HTTP 200 + uptime, counters
  API->>Gate: read ENS allowlist + stake posture
  API->>Metrics: expose gauges/counters
  Gate-->>API: { healthy, sealed, diagnostics }
  Metrics-->>Probe: scrape-ready exposition
```

## System architecture

```mermaid
flowchart LR
  subgraph Control[Owner / Multisig Control]
    Pause[Pause / resume]
    Routes[Treasury + divisors]
    Metadata[Registry + metadata]
  end
  subgraph Chain[On-chain rails]
    Manager[AlphaNodeManager.sol]
    Token[$AGIALPHA\n0xa61a...a1fa]
  end
  subgraph Spine[Data spine]
    Telemetry[(Telemetry ingress)]
    Labor[SLU scoring]
    Index[GSLI weights + divisor]
  end
  subgraph Surface[Public surface]
    API[Read-only REST API]
    Metrics[/Prometheus + OTel/]
  end
  Control -->|Calldata| Manager
  Manager -->|Rewards| Token
  Telemetry --> Labor --> Index --> API
  Labor --> Metrics
  API -->|CORS + optional API key| Dashboards[Dashboards / Agents]
  Dashboards --> Feedback[Restake / scale]
  Feedback --> Control
  classDef accent fill:#0f172a,stroke:#22c55e,stroke-width:1.5px,color:#e2e8f0;
  class Control,Chain,Spine,Surface accent;
```

### Connectivity spine (QUIC-first, TCP-resilient, NAT-aware)

- **Deterministic discovery**: ENS text records + `_dnsaddr` hydration keep peer multiaddrs normalized before transport selection, anchoring connectivity in the same registry that governs operator sovereignty.【F:src/identity/loader.ts†L20-L106】【F:docs/ens-identity-and-node-attestation-v0.0.1-alpha.md†L65-L101】
- **Transport bias**: prefer QUIC for low-latency handshakes and congestion control while keeping TCP always-on for restrictive networks—operators can stage QUIC-only, TCP-only, or mixed fleets without altering higher-level APIs.
- **NAT traversal playbook**: stage DCUtR hole-punching atop a reachable bootstrap/relay set, pair it with AutoNAT feedback to trim announced multiaddrs to dialable candidates, and cap Circuit Relay v2 (reservations + bandwidth ceilings) to prevent DoS amplification.
- **Diagnostics-first**: structured logs should tag each connection attempt with the chosen transport (QUIC or TCP), AutoNAT reachability, and relay reservation counts so operators can audit behavior live.

#### Transport + NAT toggles (env/.env.example)

| Variable | Default | Purpose |
| --- | --- | --- |
| `TRANSPORT_ENABLE_QUIC` | `true` | Prefer QUIC where peers support it; disable to force TCP-only for restrictive networks. |
| `TRANSPORT_ENABLE_TCP` | `true` | Keep TCP registered as a fallback; disable for QUIC-only experiments. |
| `ENABLE_HOLE_PUNCHING` | `true` | Register DCUtR so NATed peers can punch through when a relay/bootstrap node introduces them. |
| `AUTONAT_ENABLED` | `true` | Continuously probe reachability to advertise dialable addresses that match reality. |
| `AUTONAT_THROTTLE_SECONDS` | `60` | Rate-limit AutoNAT probes to avoid flapping and DoS windows. |
| `RELAY_ENABLE_CLIENT` | `true` | Allow dialing through Circuit Relay v2 when direct paths fail. |
| `RELAY_ENABLE_SERVER` | `false` | Opt-in to serving relay reservations; keep off unless resourced. |
| `RELAY_MAX_RESERVATIONS` | `32` | Cap concurrent relay slots to avoid overload. |
| `RELAY_MAX_CIRCUITS_PER_PEER` | `8` | Per-peer circuit quota to resist abuse. |
| `RELAY_MAX_BANDWIDTH_BPS` | _(blank)_ | Optional bandwidth ceiling for relayed streams; leave blank to disable shaping. |
| `P2P_LISTEN_MULTIADDRS` | _(blank)_ | Explicit listen addresses; empty uses libp2p defaults. |
| `P2P_PUBLIC_MULTIADDRS` | _(blank)_ | Manual public announce overrides (in addition to ENS `_dnsaddr`). |
| `P2P_RELAY_MULTIADDRS` | _(blank)_ | Known relay/bootstrap multiaddrs to seed DCUtR and relayed dialing. |
| `P2P_LAN_MULTIADDRS` | _(blank)_ | Local/LAN addresses announced only when reachability is private. |
| `AUTONAT_REACHABILITY` | _(blank)_ | Optional hint (`public` | `private` | `unknown`) to pin announce posture in lab testing. |

#### Manual transport validation (mirrors Epic A acceptance tests)

1. **QUIC-only node**: set `TRANSPORT_ENABLE_QUIC=true`, `TRANSPORT_ENABLE_TCP=false`; confirm it dials a mixed (QUIC+TCP) node and logs `transport=quic`.
2. **TCP-only node**: set `TRANSPORT_ENABLE_QUIC=false`, `TRANSPORT_ENABLE_TCP=true`; confirm it dials a mixed node and logs `transport=tcp`.
3. **Mixed environment**: both toggles true; verify dials prefer QUIC when peer multiaddrs include it and fall back to TCP otherwise.
4. **Hole punch drills**: behind the same NAT, run two nodes with `ENABLE_HOLE_PUNCHING=true` and a reachable relay/bootstrap host; watch logs for `Attempting hole punch` → `Hole punch succeeded/failed`.
5. **AutoNAT sanity**: on a cloud VM, confirm reachability emits `public`; behind a home NAT, expect `private` with relay-only announced addrs; flapping should settle after `AUTONAT_THROTTLE_SECONDS` windows.
6. **Relay quotas**: when opting into `RELAY_ENABLE_SERVER=true`, push past `RELAY_MAX_RESERVATIONS` to confirm new reservations are rejected while existing circuits remain intact; keep bandwidth ceilings dialed via `RELAY_MAX_BANDWIDTH_BPS` for DoS resistance.

Runtime guardrails: `src/network/transportConfig.js` materializes these toggles into a normalized transport plan (QUIC-first with TCP fallback by default) and logs it at bootstrap. Misconfigurations such as disabling both transports fail fast so operators know the node will still dial peers before any jobs are scheduled.
Host wiring: `src/network/libp2pHostConfig.js` stitches the transport plan with reachability-aware announce sets, relay quotas, and listen overrides so operators can export the exact libp2p options or compare observed transports against intent during rollout.

```mermaid
flowchart LR
  subgraph Discovery[Identity & Address Hygiene]
    ENS[ENS records\npeerId + dnsaddr]
    Loader[Node identity loader\n(normalizes multiaddrs)]
  end
  subgraph Transports[QUIC-first transport stack]
    QUIC[QUIC dial\npreferred]
    TCP[TCP dial\nfallback]
  end
  subgraph Traversal[NAT & Relay Safety]
    DCUtR[DCUtR hole punch]
    AutoNAT[AutoNAT reachability]
    Relay[Relay v2 quotas]
  end
  subgraph Surface[Runtime Surfaces]
    API[/REST + metrics/]
    Dashboard[Dashboard]
  end
  ENS --> Loader --> QUIC & TCP
  QUIC & TCP --> DCUtR --> AutoNAT --> Relay
  Relay --> API --> Dashboard
  classDef accent fill:#0b1120,stroke:#38bdf8,stroke-width:1.5px,color:#cbd5e1;
  class Discovery,Transports,Traversal,Surface,ENS,Loader,QUIC,TCP,DCUtR,AutoNAT,Relay,API,Dashboard accent;
```

### Command and control surface

```mermaid
flowchart LR
  Owner[Owner / Multisig] -->|Bearer token| GovAPI[Governance API (/governance/*)]
  GovAPI --> Calldata[Calldata builders]
  Calldata --> Manager[AlphaNodeManager.sol]
  Manager --> Treasury[Treasury + emissions routes]
  Manager --> Pauser[Pause / resume]
  Manager --> Validators[Validator set / thresholds]
  Manager --> Metadata[Node metadata + registry upgrades]
  GovAPI --> OwnerTools[CLI verbs in src/index.js]
  OwnerTools --> GovAPI
  GovAPI --> Ledger[Governance ledger + audit trail]
  Ledger --> Reports[Status exports / diagnostics]
  Manager --> DashboardSignals[SPA surfaces state via API]
```

### CI / QA autopilot

- **Full-stack tests on every push**: `npm run ci:test` now executes the core vitest suite plus `npm run test:frontend` (jsdom smoke for the dashboard) so the UI stays aligned with the API surface and is enforced as its own required check name.
- **Local parity with branch protection**: `npm run ci:verify` wires linting, backend + frontend tests, coverage, Solidity lint/compile, subgraph codegen/build, npm audit, policy gates, and branch gate—identical to the GitHub Actions matrix.
- **Health surfaces baked in**: `/health` and `/healthz` return status, counters, gate posture, and uptime; `/metrics` powers Prometheus scrapes. Structured Pino logs annotate SLU scoring, GSLI rebalances, and backfills with machine-readable `event` fields for SIEM pipelines.
- **Structured telemetry assertions**: CI now inspects the SLU scoring engine and GSLI indexer for structured `event` payloads so logging contracts remain stable for downstream collectors.

#### Branch-protection recipe (visible + enforced)

1. Keep `.github/required-checks.json` in sync with `ci.yml` (names must match the job labels in GitHub Actions).
2. Enable “Require status checks to pass before merging” for `main` and select the entries from `required-checks.json` so backend, frontend, coverage, Solidity, subgraph, Docker smoke, and security gates are mandatory.
3. Verify locally with `npm run ci:verify` before opening a PR; the same gates run in CI, ensuring badges at the top of this README stay green.
4. Use `scripts/publish-badges.mjs` (auto-triggered on `main`) to keep Shields current for CI, coverage, and security posture.

### CI, branch protection, and visibility

- **One command, all gates**: `npm run ci:verify` runs lint (Markdown + links), vitest (including dashboard smoke), coverage export, Solidity lint/compile, subgraph TS build, `npm audit --omit=dev`, policy gates, and branch gating to mirror the GitHub workflow locally.
- **Workflow**: `.github/workflows/ci.yml` fans out into lint, tests, coverage, Solidity, subgraph build, Docker smoke, security scan, and badge publication for `main`.
- **Enforcement**: `.github/required-checks.json` lists every required status for PRs and `main`, including the combined backend + frontend test gate, ensuring visible, consistent checks.
- **Badges**: Shields at the top reflect GitHub Actions status, required checks, and coverage enforcement so green is obvious to reviewers and operators.

```mermaid
flowchart LR
  Dev[Local operator\n`npm run ci:verify`] --> Gates[Full gate bundle\n(lint/test/solidity/subgraph/audit/policy)]
  Gates --> GH[GitHub Actions\nci.yml]
  GH --> Checks[Required checks\n.json]
  Checks --> Branch[Branch protection\nmain + PRs]
  Branch --> Badge[Status badges\nREADME]
  classDef accent fill:#0f172a,stroke:#c084fc,stroke-width:1.5px,color:#e2e8f0;
  class Dev,Gates,GH,Checks,Branch,Badge accent;
```

### Public API data flow

```mermaid
flowchart TD
  Ingest[Task runs + energy + quality] --> Validate[AJV/Zod validation]
  Validate --> Record[SQLite + idempotency]
  Record --> Scores[SLU scoring engine]
  Scores --> Indexing[GSLI rebalance + divisor]
  Indexing --> Latest[/GET /index/latest/]
  Indexing --> History[/GET /index/history/]
  Scores --> Providers[/GET /providers/]
  Scores --> ProviderScores[/GET /providers/{id}/scores/]
  classDef api fill:#111827,stroke:#0ea5e9,stroke-width:1.5px,color:#f9fafb;
  class Latest,History,Providers,ProviderScores api;
```

## Minimal internal dashboard (Epic 6)

- **Single-page React/Vite app** (`dashboard/`) with three tabs: **Index** (GSLI line chart + window controls), **Providers** (registry table + SLU trendline per provider), and **Telemetry Debug** (recent TaskRuns with energy/quality overlays and provider/date filters).
- **Connection-aware cockpit**: a top-level connection bar lets operators change API base URLs and API keys live, then resync all tabs without rebuilding. API headers now include both `X-API-Key` and `Authorization: Bearer` for compatibility with any gateway rule.
- **Signal-complete tables**: Provider grid ships with SLU + energy (EA) + quality (QA) + validation consensus (VC) columns so operators see every modulation at a glance.
- **Mock-friendly**: front-end smoke test (`test/dashboard.app.test.jsx`) mounts all views in jsdom and asserts API hydration using mocked fetch responses (including VC coverage).
- **Run it locally**: `npm run dashboard:dev` (hot reload on `http://localhost:4173`), `npm run dashboard:build` (production bundle in `dashboard/dist`), `npm run dashboard:preview` (serve the built bundle).

| Tab | Backing endpoint(s) | What you see |
| --- | --- | --- |
| Index | `GET /index/history` (optionally `from`, `to`, `limit`) | GSLI headline chart, date-window controls, trend delta, and latest effective date. |
| Providers | `GET /providers`, `GET /providers/{id}/scores` | Registry grid with latest SLU/EA/QA/VC and per-provider SLU trendlines on click. |
| Telemetry Debug | `GET /telemetry/task-runs?from&to&provider&limit` | Recent TaskRuns with throughput, tokens, energy, quality overlays, and provider/date filters for ingest sanity checks. |

### Dashboard operator guide

- **API targeting**: set `VITE_API_BASE_URL` and, if needed, `VITE_PUBLIC_API_KEY` in a `.env` file inside `dashboard/` to point the UI at your live node; defaults to `http://localhost:8080` with no key. You can also override both live from the connection bar (no rebuild required).
- **Deterministic builds**: the Vite config pins the dashboard root to `dashboard/` for both dev and production so the emitted bundle always lands in `dashboard/dist` without path ambiguity.
- **Non-technical launch**: run `npm run dashboard:dev` for hot reloads or open the static `dashboard/dist/index.html` after `npm run dashboard:build`; no extra wiring is required for mock-mode thanks to the bundled smoke test.
- **Env starter kits**: drop these into `dashboard/.env` or `dashboard/.env.local` for instant targeting:

  ```ini
  # dashboard/.env.local
  VITE_API_BASE_URL=http://localhost:8080
  VITE_PUBLIC_API_KEY=demo-public-key
  ```

  And the backing API can mirror that simplicity with:

  ```ini
  # .env
  API_PORT=8080
  API_PUBLIC_READ_KEY=demo-public-key
  API_DASHBOARD_ORIGIN=http://localhost:4173
  ```

  With those in place, a non-technical operator can run `npm start` followed by `npm run dashboard:dev` and immediately see live data without additional wiring.

```mermaid
flowchart LR
  Base[Connection bar\n(API base + key)] --> IndexTab[Index tab]
  Base --> ProvidersTab[Providers tab]
  Base --> TelemetryTab[Telemetry tab]
  IndexTab -->|/index/history| IndexAPI
  ProvidersTab -->|/providers + /providers/{id}/scores| ProvidersAPI
  TelemetryTab -->|/telemetry/task-runs| TelemetryAPI
  classDef accent fill:#0b1120,stroke:#38bdf8,stroke-width:1.5px,color:#cbd5e1;
  class Base,IndexTab,ProvidersTab,TelemetryTab,IndexAPI,ProvidersAPI,TelemetryAPI accent;
```

```mermaid
flowchart TD
  subgraph UI[Debug Deck SPA]
    A[Index tab]
    B[Providers tab]
    C[Telemetry Debug tab]
  end
  subgraph API[Read-only API]
    H[/index/history\n/index/latest/]
    P[/providers\n/providers/{id}/scores/]
    T[/telemetry/task-runs/]
  end
  subgraph Controls[Operator toggles]
    K[VITE_API_BASE_URL]
    G[VITE_PUBLIC_API_KEY]
  end
  A --> H
  B --> P
  C --> T
  Controls --> UI
  classDef accent fill:#0b1120,stroke:#38bdf8,stroke-width:1.5px,color:#cbd5e1;
  classDef ctrl fill:#111827,stroke:#c084fc,stroke-width:1.5px,color:#e0e7ff;
  class UI,API accent;
  class Controls ctrl;
```

```mermaid
flowchart LR
  subgraph SPA[Debug Deck]
    Nav[Index | Providers | Telemetry]
    Charts[Chart.js visual layers]
  end
  subgraph API[Read-only API]
    IndexAPI[/GET /index/history/]
    ProvidersAPI[/GET /providers + /providers/{id}/scores/]
    TelemetryAPI[/GET /telemetry/task-runs/]
  end
  subgraph Spine[Telemetry Spine]
    Runs[(task_runs)]
    Energy[(energy_reports)]
    Quality[(quality_evaluations)]
  end
  Nav --> IndexAPI
  Nav --> ProvidersAPI
  Nav --> TelemetryAPI
  TelemetryAPI --> Runs
  Runs --> Energy
  Runs --> Quality
  IndexAPI --> GSLI[GSLI series]
  ProvidersAPI --> SLU[SLU series]
  classDef accent fill:#0b1120,stroke:#38bdf8,stroke-width:1.5px,color:#cbd5e1;
  classDef db fill:#111827,stroke:#22c55e,stroke-width:1.5px,color:#cbd5e1;
  class SPA,API accent;
  class Runs,Energy,Quality db;
```

## Public API (read-only)

**Base URL**: `http://<host>:<API_PORT>` (default `8080`). All endpoints support CORS; set `API_DASHBOARD_ORIGIN` to a specific origin for production and `API_PUBLIC_READ_KEY` to require `X-API-Key` or `Authorization: Bearer <key>`.

| Endpoint | Purpose | Query params |
| --- | --- | --- |
| `GET /health` | Lightweight liveness/readiness payload (uptime, recent telemetry counters, health gate state). | — |
| `GET /index/latest` | Latest GSLI value with weight set + constituents. | — |
| `GET /index/history` | Historical index values (paginated). | `from=YYYY-MM-DD`, `to=YYYY-MM-DD`, `limit`, `offset` |
| `GET /providers` | Provider registry with most recent SLU score (paginated). | `limit`, `offset` |
| `GET /providers/{id}/scores` | Provider SLU history (paginated). | `from`, `to`, `limit`, `offset` |
| `GET /telemetry/task-runs` | Recent ingested TaskRuns with provider + energy/quality overlays (paginated). | `from`, `to`, `provider`, `limit`, `offset` |

Example: latest index with keyed CORS gate.

```http
GET /index/latest
X-API-Key: public-key-123
Origin: https://dash.example.com
```

```json
{
  "index": {"id": 12, "effective_date": "2024-01-03", "headline_value": 24.3, "weight_set_id": 7, "divisor_version": "v1"},
  "weight_set": {"id": 7, "effective_date": "2024-01-03", "cap": 0.15, "lookback_window_days": 90},
  "constituents": [
    {
      "provider_id": 1,
      "weight": 0.42,
      "metadata": {"capped": false},
      "provider": {"id": 1, "name": "helios-labs", "region": "na-east", "sector_tags": ["llm"], "energy_mix": "hydro"}
    }
  ]
}
```

Example: SLU history for a provider.

```http
GET /providers/1/scores?from=2024-01-01&to=2024-01-03&limit=2
```

```json
{
  "provider": {"id": 1, "name": "helios-labs", "region": "na-east"},
  "window": {"from": "2024-01-01", "to": "2024-01-03"},
  "pagination": {"total": 2, "limit": 2, "offset": 0, "nextOffset": null},
  "scores": [
    {"id": 11, "provider_id": 1, "as_of_date": "2024-01-03", "slu": 0.86, "rationale": "growth-p2"},
    {"id": 10, "provider_id": 1, "as_of_date": "2024-01-02", "slu": 0.82, "rationale": "growth-p1"}
  ]
}
```

Example: telemetry task-runs by provider (dashboard uses this for the Telemetry tab).

```http
GET /telemetry/task-runs?from=2024-01-01&to=2024-01-03&provider=1&limit=5
X-API-Key: public-key-123
```

```json
{
  "window": {"from": "2024-01-01", "to": "2024-01-03"},
  "pagination": {"total": 1, "limit": 5, "offset": 0, "nextOffset": null},
  "task_runs": [
    {
      "id": 41,
      "provider_id": 1,
      "provider": {"id": 1, "name": "helios-labs"},
      "status": "completed",
      "raw_throughput": 120,
      "tokens_processed": 1200,
      "energy_report": {"kwh": 3.5, "region": "na-east"},
      "quality_evaluation": {"score": 0.91},
      "created_at": "2024-01-03T12:00:00Z"
    }
  ]
}
```

**Schema stability**: Payloads are produced directly from the SQLite repositories in `src/persistence/repositories.js` using date-window guards, pagination helpers, and optional API-key enforcement inside `src/network/apiServer.js`. Response shapes are under test in `test/apiServer.test.js` to keep dashboards stable across releases.

## Owner controls & $AGIALPHA

- **Contract surface**: `contracts/AlphaNodeManager.sol` plus calldata builders in `src/services/governance.js` keep pausing, validator rotations, emissions, treasury routing, registry upgrades, productivity directives, work-meter tuning, and metadata mutable at any time.
- **CLI wrappers**: `src/index.js` verbs cover pausing, divisors, node metadata, ENS alignment, staking/activation, treasury updates, emission multipliers, productivity routing, and job registry adjustments without redeploying.
- **API governance**: Authenticated endpoints (`/governance/*`) demand `GOVERNANCE_API_TOKEN` and log ledger entries for auditability; owner tokens may be supplied through `Authorization: Bearer` or `X-Owner-Token` headers.
- **Pause & recover**: System pause, submission windows, emission caps, and treasury addresses can be rotated at runtime, giving the operator complete command for the AGI jobs platform.
- **Treasury & emissions routing**: `$AGIALPHA` (token `0xa61a3b3a130a9c20768eebf97e21515a6046a1fa`, 18 decimals) helpers cover approvals, treasury rotation, emission caps, heartbeat/epoch tuning, and productivity-weighted flows so owners can respond instantly to market signals.

| Control dial | Smart contract / code path | Runtime / CLI entry |
| --- | --- | --- |
| Pause / resume everything | `pause`, `unpause` in [`contracts/AlphaNodeManager.sol`](contracts/AlphaNodeManager.sol) | `node src/index.js governance:pause` / `governance:resume` |
| Validator rotation & thresholds | `setValidator`, `recordAlphaWUValidation`, `applySlash` in `AlphaNodeManager.sol` | `node src/index.js governance:validators`, `governance:slash` |
| Registry identity & controllers | `registerIdentity`, `updateIdentityController`, `setIdentityStatus`, `revokeIdentity` in `AlphaNodeManager.sol` | `node src/index.js governance:identity --help` (ENS alignment, controller swaps, activation toggles) |
| Staking flows | `stake`, `withdrawStake` in `AlphaNodeManager.sol`; staking helpers in `src/services/token.js` | `node src/index.js staking:*` verbs for deposits/withdrawals routed through owner authority |
| α‑WU lifecycle | `recordAlphaWUMint`, `recordAlphaWUAcceptance` in `AlphaNodeManager.sol` | `node src/index.js governance:wu-mint` / `wu-accept` to log events under owner supervision |
| Treasury + emissions | `$AGIALPHA` address baked into `AlphaNodeManager.sol` (`CANONICAL_AGIALPHA`) and governance builders in `src/services/governance.js` | `node src/index.js governance:treasury`, `governance:emissions`, `governance:productivity` |

Owner sovereignty spans every critical dial; the control loop keeps pausing, rewards, registry metadata, and staking posture reprogrammable without code changes.

### Owner command checklist (all hot-swappable without redeploying)

- Pause / unpause the entire node to freeze emissions and ingress before maintenance windows.
- Rotate validators or update thresholds when adding a new agent cohort.
- Refresh registry metadata (ENS, controllers, activation flags) to reassign operational authority instantly.
- Redirect treasury and emissions routes, caps, or divisors in response to market or policy shifts.
- Approve / withdraw staking balances and adjust productivity bindings to rebalance incentives live.

Every lever above is exposed through both the governance API (`/governance/*`) and the CLI verbs in `src/index.js`, always anchored to the canonical `$AGIALPHA` token at `0xa61a3b3a130a9c20768eebf97e21515a6046a1fa` (18 decimals).

```mermaid
flowchart LR
  subgraph OwnerControls[Owner / Multisig Commands]
    Pause[Pause / Unpause]
    Validators[Validator set + thresholds]
    Treasury[Treasury + emission routes]
    Registry[Provider registry + metadata]
    Staking[Stake caps + withdrawals]
  end
  subgraph Runtime[Node Runtime]
    API[/Governance API/]
    Ledger[(Governance ledger)]
    Engine[Labor + Index engines]
  end
  OwnerControls -->|calldata builders| API
  API --> Ledger
  Ledger --> Engine
  Engine -->|status + diagnostics| OwnerControls
  classDef accent fill:#0f172a,stroke:#22c55e,stroke-width:1.5px,color:#e2e8f0;
  class OwnerControls,Runtime accent;
```

## Data spine & migrations

- **SQLite migrations**: `src/persistence/migrations` build durable tables for providers, task types, task runs, energy/quality reports, SLU scores, index weights/values, and governance ledger entries.
- **Seeds**: `npm run db:seed` plants sample providers and task types for immediate dashboards; `initializeDatabase({ withSeed: true })` drives tests and the API server for deterministic bootstraps.
- **Repositories**: CRUD helpers live in `src/persistence/repositories.js` with pagination + JSON normalization to keep API responses consistent.

## Quickstart (non-technical friendly)

1. **Install Node.js 20.18+ & npm 10+** (or build the container with the provided `Dockerfile`).
2. **Clone and install**:

   ```bash
   git clone https://github.com/MontrealAI/AGI-Alpha-Node-v0.git
   cd AGI-Alpha-Node-v0
   npm ci
   ```

3. **Copy the env template** to align API keys, DB location, and dashboard origins:

   ```bash
   cp .env.example .env
   # adjust API_PUBLIC_READ_KEY, API_DASHBOARD_ORIGIN, AGI_ALPHA_DB_PATH, GOVERNANCE_API_TOKEN as needed
   ```

4. **Bootstrap local data** (in-memory by default):

   ```bash
   npm run db:seed
   ```

5. **Run the node** (public API + telemetry on `API_PORT`, metrics on `/metrics`):

   ```bash
   npm start -- --help   # discover CLI verbs
   npm start             # launches API + telemetry spine
   ```

6. **Launch the debug deck** (optional):

   ```bash
   npm run dashboard:dev      # hot-reloads dashboard at http://localhost:4173
   npm run dashboard:build    # emit production bundle to dashboard/dist
   npm run dashboard:preview  # serve the built bundle locally
   ```

7. **Secure the API** (optional): set `API_PUBLIC_READ_KEY` and `API_DASHBOARD_ORIGIN` to gate read access and scope CORS.
8. **Deploy**: use the Helm chart at `deploy/helm/agi-alpha-node` or `docker build -t agi-alpha-node:latest .` for containerized rollouts.

## Configuration matrix

| Variable | Default | Purpose |
| --- | --- | --- |
| `API_PUBLIC_READ_KEY` | _(unset)_ | Optional API key required for `/index/*` and `/providers/*` endpoints when set. Provide via `X-API-Key` or `Authorization: Bearer <key>`. |
| `API_DASHBOARD_ORIGIN` | `*` | CORS allowlist for dashboards; set to an exact origin (e.g., `https://dash.example.com`) for production. |
| `API_PORT` | `8080` | HTTP port for the public API and telemetry ingest surface. |
| `METRICS_PORT` | `9464` | Prometheus `/metrics` port exposed by the monitoring server. |
| `GOVERNANCE_API_TOKEN` | _(unset)_ | Bearer token required for owner-only governance endpoints; send via `Authorization` or `X-Owner-Token`. |
| `AGI_ALPHA_DB_PATH` | `:memory:` | SQLite location; set to a filesystem path for persistence across restarts. |
| `TELEMETRY_ENABLED` | `true` | Toggles ingestion servers and monitoring gauges. |
| `TELEMETRY_HASH_ALGO` | `sha256` | Hashing algorithm for provider API keys stored in `provider_api_keys`. |
| `VERIFIER_PORT` | `8787` | Port for the verifier server that validates α‑WU attestations. |
| `AGIALPHA_TOKEN_ADDRESS` | `0xa61a3b3a130a9c20768eebf97e21515a6046a1fa` | Token contract used by staking, rewards, and governance helpers. |

## CI, quality gates, and observability

```mermaid
flowchart TD
  Lint[Markdown + Links] --> Matrix{Required Checks}
  Tests[Vitest + AJV gate] --> Matrix
  Sol[Solhint + solc sim] --> Matrix
  TS[Subgraph TS Build] --> Matrix
  Cov[c8 Coverage + artifact upload] --> Matrix
  Docker[Docker build + CLI smoke] --> Matrix
  Security[npm audit --audit-level=high] --> Matrix
  Policy[Health + branch gates] --> Matrix
  Matrix -->|enforced via required-checks.json| PRs[[PRs & main]]
```

- **Structured logs**: Synthetic labor scoring and GSLI rebalances emit pino-formatted events (energy/quality/consensus and weight-set metadata) so operators can trace every calculation in production or CI.
- **Full visibility**: CI definition lives in [`.github/workflows/ci.yml`](.github/workflows/ci.yml) with artifacts for coverage and Docker smoke logs.
- **Required checks**: `.github/required-checks.json` mirrors the matrix and is enforced on PRs and `main`.
- **Coverage discipline**: `npm run coverage` produces LCOV/JSON summaries; the coverage job uploads artifacts for downstream badges.
- **Dashboard proofing**: front-end smoke tests (jsdom) run in `npm test` to validate SPA mounting + API mocks; the Vite bundle is pinned via `npm run dashboard:build`.

| Gate | Command (local) | What it enforces |
| --- | --- | --- |
| Lint Markdown & Links | `npm run lint:md && npm run lint:links` | Style + external/internal link integrity. |
| Unit & Integration Tests | `npm test` | API, telemetry, governance, dashboard smoke coverage. |
| Coverage Report | `npm run coverage` | LCOV + JSON summaries uploaded as CI artifact. |
| Docker Build & Smoke Test | `docker build ...` + container `--help` | Ensures the container boots and CLI verbs are present. |
| Solidity Lint & Compile | `npm run lint:sol && npm run test:sol` | Solhint + solc pipeline stays deterministic. |
| Subgraph TypeScript Build | `npm run ci:ts` | Manifest rendering + TS build for the subgraph toolchain. |
| Dependency Security Scan | `npm run ci:security` | `npm audit --audit-level=high` stays clean. |

### Branch protection & visibility

- Required checks are codified in [`.github/required-checks.json`](.github/required-checks.json) and mirrored by the workflow matrix, so GitHub enforces the same gates on PRs and `main`.
- Status badges are produced from CI artifacts (`badges` job) and surfaced at the top of this README so the check surface is always visible.
- To validate locally before pushing, run `npm run ci:verify`—it executes the entire matrix to match the protected-branch policy.

```mermaid
flowchart TD
  Local[Local ci:verify] --> MatrixChecks[Lint \n Test \n Coverage \n Solidity \n Subgraph \n Docker \n Security]
  MatrixChecks --> Required[required-checks.json]
  Required --> Branches[PRs & main (protected)]
  Branches --> Badges[Status badges \n README]
  classDef accent fill:#0f172a,stroke:#f59e0b,stroke-width:1.5px,color:#f8fafc;
  class Local,MatrixChecks,Required,Branches,Badges accent;
```

- **Security**: `npm audit --audit-level=high`, health gates, and branch policy checks run on every PR.
- **One-shot local reproduction**: `npm run ci:verify` executes the full matrix (lint, tests, coverage, Solidity, subgraph build, audit, policy, branch gates) to guarantee you match the required PR checks before pushing.

### Reproduce the matrix locally

- `npm run lint` – markdown + link hygiene.
- `npm test` – Vitest suite including API, telemetry, governance, and dashboard smoke tests.
- `npm run coverage` – generates LCOV/JSON coverage artifacts.
- `npm run ci:solidity` – solhint + solc compile simulation for contracts.
- `npm run ci:ts` – subgraph manifest render + `npm --prefix subgraph run build:ci`.
- `npm run ci:security` – high-level `npm audit` scan mirroring CI behavior.

## Operations playbook

- **Health probes**: `/health` (and `/healthz`) surface uptime + telemetry counters + health gate state; `/status` returns α‑WU posture and last epoch summary; `/status/diagnostics` expands per-job/device-class/SLA aggregates.
- **API safety**: Governance endpoints demand owner tokens; public endpoints can be gated with `API_PUBLIC_READ_KEY`. CORS is limited to `API_DASHBOARD_ORIGIN` and preflight is handled automatically.
- **Secrets**: Environment variables are loaded via `dotenv`; never store private keys in the repo. Owner auth is accepted via `Authorization: Bearer` or `X-Owner-Token`.
- **Data durability**: Configure `AGI_ALPHA_DB_PATH` to persist beyond restarts; WAL is enabled by default.
- **Telemetry drill-downs**: `/telemetry/task-runs` exposes paginated task runs with optional provider filters; pair with the dashboard Telemetry tab for quick ingestion sanity checks.

## Repository atlas

- `src/network/apiServer.js` – HTTP surface (telemetry ingest, governance, read-only public API, health/metrics).
- `src/services/globalIndexEngine.js` – GSLI eligibility, cap-aware weight sets, divisor-aware index math.
- `src/services/syntheticLaborEngine.js` – SLU computation and provider scoring pipeline.
- `src/services/governance.js` – Owner calldata builders (pausing, validators, emissions, treasury, registry upgrades, work meters, productivity controls).
- `src/persistence` – SQLite migrations, seeds, repositories, and CLI helpers.
- `contracts/AlphaNodeManager.sol` – Owner-governed contract surface; `$AGIALPHA` integrations in `contracts` + `src/services/token.js`.
- `deploy/helm/agi-alpha-node` – Production Kubernetes packaging; `Dockerfile` for container builds.

## Appendix: CLI & API recipes

```bash
# Governance: pause the system (owner token required via env OWNER_TOKEN)
node src/index.js governance:pause --operator 0xYourOwner --signature 0xdeadbeef

# Compute today’s GSLI headline value after rebalance
node src/index.js index:rebalance --cap 15 --lookback-days 90
node src/index.js index:daily --as-of $(date +%F)

# Backfill index history for dashboards
node src/index.js index:backfill --from 2024-01-01 --to 2024-03-01 --cap 20 --rebalance-interval 30

# Inspect ENS alignment for your node
node src/index.js ens:verify --label 1.alpha.node.agi.eth --operator 0xYourOperator
```
