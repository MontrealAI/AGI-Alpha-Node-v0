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
    <img src="https://img.shields.io/badge/Required%20Checks-Enforced%20on%20PRs-8b5cf6?logo=github" alt="Required PR checks" />
  </a>
  <a href="https://github.com/MontrealAI/AGI-Alpha-Node-v0/actions?query=branch%3Amain">
    <img src="https://img.shields.io/badge/Checks-Visible%20in%20GitHub-0ea5e9?logo=github" alt="Checks visibility" />
  </a>
  <img src="https://img.shields.io/badge/Coverage-c8%20enforced-22c55e?logo=jest&logoColor=white" alt="Coverage" />
  <img src="https://img.shields.io/badge/Security-npm%20audit%20%7C%20health%20gates-ef4444?logo=npm&logoColor=white" alt="Security gates" />
  <img src="https://img.shields.io/badge/Test%20Matrix-vitest%20%7C%20solc%20%7C%20markdownlint-22c55e?logo=vitest&logoColor=white" alt="Test matrix" />
  <img src="https://img.shields.io/badge/Observability-c8%20coverage%20%7C%20OTel%20%7C%20prom--client-0ea5e9?logo=testinglibrary&logoColor=white" alt="Observability" />
  <img src="https://img.shields.io/badge/Public%20API-Read--only%20%7C%20CORS-22c55e?logo=fastapi&logoColor=white" alt="Public API" />
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
</p>

> **AGI Alpha Node v0** metabolizes heterogeneous agentic labor into verifiable α‑Work Units (α‑WU) and Synthetic Labor Units (SLU), rebalances the Global Synthetic Labor Index (GSLI), exposes audited read‑only REST telemetry, and routes the `$AGIALPHA` treasury (token: `0xa61a3b3a130a9c20768eebf97e21515a6046a1fa`, 18 decimals) under complete owner command. Every dial can be paused, rerouted, or retuned without redeploying, delivering a production-grade intelligence core built to bend markets.

## Flash scan

- **Owner-first sovereignty**: `contracts/AlphaNodeManager.sol` and CLI verbs in `src/index.js` keep pausing, validator rotation, emissions, treasury routing, productivity bindings, registry upgrades, and metadata under owner control with calldata builders in `src/services/governance.js`.
- **Supernormal telemetry**: Schema-validated ingest with hashed API keys, idempotent task-run recording, and Prometheus/OTel exports preserve signal fidelity for dashboards and policy.
- **Public API (read-only)**: `/index/latest`, `/index/history`, `/providers`, `/providers/{id}/scores` expose GSLI and provider metrics with optional API-key gating and CORS allowlisting for production dashboards.
- **Deterministic data spine**: SQLite migrations seed providers, task types, SLU scores, and index values with indexes on provider/day for instant dashboards and subgraph alignment.
- **Production-safe defaults**: Helm chart, Docker build, CI gates, health policies, and seeded CLIs keep it deployable by non-specialists while remaining fully operator-tunable.

## System architecture (signal-to-yield)

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
```

## Vision & token flywheel

```mermaid
flowchart TD
  Jobs[Agentic jobs & prompts] --> AlphaWU[α‑WU execution]
  AlphaWU --> TelemetrySpine[(Telemetry spine)]
  TelemetrySpine --> SLU[SLU scoring]
  SLU --> GSLI[Global Synthetic Labor Index]
  GSLI --> Rewards[$AGIALPHA rewards\n0xa61a...a1fa (18 dp)]
  Rewards --> Providers[Providers & operators]
  Providers --> Reinvest[Restake / scale nodes]
  Reinvest --> Jobs
  Owner[[Owner control]] -->|Pause / Divisors / Caps| GSLI
  Owner -->|Treasury routing| Rewards
```

- **Token surface**: `$AGIALPHA` lives at `0xa61a3b3a130a9c20768eebf97e21515a6046a1fa` and is referenced across the CLI, governance builders, staking helpers, and treasury controls.
- **Feedback flywheel**: More telemetry → higher SLU → increased GSLI weights → more rewards → additional nodes → more telemetry.
- **Owner override**: Caps, divisors, exclusions, and pausing switches are editable mid-flight so the operator can redirect incentives instantly.

## Public API (read-only)

**Base URL**: `http://<host>:<API_PORT>` (default `8080`). All endpoints are CORS-aware; set `API_DASHBOARD_ORIGIN` for production dashboards and `API_PUBLIC_READ_KEY` to require `X-API-Key` or `Authorization: Bearer <key>`.

| Endpoint | Purpose | Query params |
| --- | --- | --- |
| `GET /index/latest` | Latest GSLI value with weight set + constituents. | — |
| `GET /index/history` | Historical index values (paginated). | `from=YYYY-MM-DD`, `to=YYYY-MM-DD`, `limit`, `offset` |
| `GET /providers` | Provider registry with most recent SLU score (paginated). | `limit`, `offset` |
| `GET /providers/{id}/scores` | Provider SLU history (paginated). | `from`, `to`, `limit`, `offset` |

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

## Owner controls & on-chain levers

- **Contract surface**: `contracts/AlphaNodeManager.sol` + helpers in `src/services/governance.js` build calldata for pausing, validator rotations, emissions, treasury routing, registry upgrades, productivity indices, and work-meter directives—every parameter remains updatable mid-flight.
- **CLI wrappers**: `src/index.js` verbs cover pausing, divisors, node metadata, ENS alignment, staking/activation, treasury updates, emission multipliers, productivity routing, and job registry adjustments without redeploying.
- **API governance**: Authenticated endpoints (`/governance/*`) demand `GOVERNANCE_API_TOKEN` and log ledger entries for auditability; owner tokens may be supplied through `Authorization: Bearer` or `X-Owner-Token` headers.
- **Pause & recover**: System pause, submission windows, emission caps, and treasury addresses can be rotated at runtime, giving the operator complete command for the AGI jobs platform.

## Data spine & migrations

- **SQLite migrations**: `src/persistence/migrations` build durable tables for providers, task types, task runs, energy/quality reports, SLU scores, index weights/values, and governance ledger entries.
- **Seeds**: `npm run db:seed` plants sample providers and task types for immediate dashboards; `initializeDatabase({ withSeed: true })` is used across tests and the API server for deterministic bootstraps.
- **Repositories**: CRUD helpers live in `src/persistence/repositories.js` with pagination + JSON normalization to keep API responses consistent.

## Quickstart (non-technical friendly)

1. **Install Node.js 20.18+ & npm 10+** (or build the container with the provided `Dockerfile`).
2. **Clone and install**:

   ```bash
   git clone https://github.com/MontrealAI/AGI-Alpha-Node-v0.git
   cd AGI-Alpha-Node-v0
   npm ci
   ```

3. **Bootstrap local data** (in-memory by default):

   ```bash
   npm run db:seed
   ```

4. **Run the node** (public API + telemetry on `API_PORT`, metrics on `/metrics`):

   ```bash
   npm start -- --help   # discover CLI verbs
   npm start             # launches API + telemetry spine
   ```

5. **Secure the API** (optional): set `API_PUBLIC_READ_KEY` and `API_DASHBOARD_ORIGIN` to gate read access and scope CORS.
6. **Deploy**: use the Helm chart at `deploy/helm/agi-alpha-node` or `docker build -t agi-alpha-node:latest .` for containerized rollouts.

## Configuration matrix (owner-first)

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

- **Full visibility**: CI definition lives in [`.github/workflows/ci.yml`](.github/workflows/ci.yml) with artifacts for coverage and Docker smoke logs.
- **Required checks**: `.github/required-checks.json` mirrors the matrix and is enforced on PRs and `main`.
- **Coverage discipline**: `npm run coverage` produces LCOV/JSON summaries; the coverage job uploads artifacts for downstream badges.
- **Security**: `npm audit --audit-level=high`, health gates, and branch policy checks run on every PR.

## Operations playbook

- **Health probes**: `/healthz` shows mode + recent telemetry counts; `/status` returns α‑WU posture and last epoch summary; `/status/diagnostics` expands per-job/device-class/SLA aggregates.
- **API safety**: Governance endpoints demand owner tokens; public endpoints can be gated with `API_PUBLIC_READ_KEY`. CORS is limited to `API_DASHBOARD_ORIGIN` and preflight is handled automatically.
- **Secrets**: Environment variables are loaded via `dotenv`; never store private keys in the repo. Owner auth is accepted via `Authorization: Bearer` or `X-Owner-Token`.
- **Data durability**: Configure `AGI_ALPHA_DB_PATH` to persist beyond restarts; WAL is enabled by default.

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
