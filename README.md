# AGI Alpha Node — $AGIALPHA

<!-- markdownlint-disable MD013 -->

Version 3.0.0 · Integrated Node Edition

An owner-controlled economic intelligence node: collect authorized observations, plan and stress-test opportunities, coordinate authenticated specialists, obtain signed review, execute an exact authorized change, settle funded $AGIALPHA work, and reinvest verified receipts within owner limits.

This is the **$AGIALPHA project**. The default runtime requires no AGI Jobs registry, USDC or OpenClaw. Older infrastructure adapters remain separately accessible through `npm run legacy -- --help`.

## Start in five minutes

Install Node.js 22.14+ and npm 10+, extract the release ZIP and run:

```bash
npm ci
npm run demo:runtime
```

Open `alpha-runtime-output/report.md` and `runtime.json`. The demonstration starts a separately keyed specialist process, exchanges signed HTTP messages, produces a reviewable plan, changes a real configuration file after signed acceptance, checks health, records an outcome and verifies replay. Usage and outcome values are synthetic; the reviewer is a demonstration role. It spends no funds.

For your own node, follow [START HERE](START_HERE.md) and the [integrated runtime guide](docs/alpha-runtime.md).

## Implemented architecture

| Pillar | Working behavior |
| --- | --- |
| Task-scoped intelligence | Usage-derived candidates, explicit economic assumptions, scenario stress tests, abstention and conservative adaptation from accepted signed outcomes; optional actual model inference |
| Specialist mesh | Configured peer discovery, signed offers/requests/results, capability and price selection, caller allowlists, capacity bounds and persistent replay protection |
| Sentinel and owner control | Cost reservations, pending-review admission, exact action permissions, pause, backoff, loss thresholds, health verification and rollback |
| Evidence ledger | Signed hash-linked records bind observations, plans, specialist results, reports, reviews, actions, outcomes and transaction receipts |
| Execution and evolution | Reviewed scalar JSON configuration changes; subsequent comparable signed measurements tighten future estimates |
| Identity | Local signing identity or mainnet ENS address verification, repeated before live work and settlement |
| $AGIALPHA | Prefunded canonical-token escrow, signature-relayed reviewer acceptance, exact-once claims, finalized receipt checks and capped staking of verified receipts |
| Operator experience | Guided setup, authenticated loopback interface, CLI, encrypted backup/restore and Linux/macOS service configuration |

Each capability has explicit limits. Specialists currently offer three deterministic analytical capabilities; their quote is not an automatic peer payment. The adaptive model is task-scoped and can only tighten supplied estimates. Execution is an owner-selected configuration change with health checks. These concrete implementations do not establish general intelligence, guaranteed financial alpha, a permissionless global marketplace or unlimited scale.

## Run and control

```bash
npm run alpha -- --home /absolute/private/node operate
npm run alpha -- --home /absolute/private/node serve
npm run alpha -- --home /absolute/private/node autopilot --runtime
npm run alpha -- --home /absolute/private/node pause
```

`operate` performs one integrated cycle. `autopilot --runtime` repeats it with conservative failure handling. `serve` prints a private browser URL and exposes status, review import and controls. External actions require exact owner configuration plus signed acceptance. Transactions require live identity and an explicitly enabled, bytecode-pinned spending policy.

The node directory contains private keys and potentially broadcastable signed transactions. Keep it private. Give reviewers only exported mission bundles. Separate keys establish role separation; organizational independence must be arranged operationally.

## Validate and recover

```bash
npm run ci:verify
npm run typecheck
npm run dashboard:build
npm run demo:runtime
```

See [qualification evidence](evidence/v3.0.0/validation.md), [recovered vision and assessment](docs/alpha-assessment.md), [release notes](RELEASE_NOTES.md) and [backup/recovery](docs/alpha-recovery.md). The package contains real local-model inference evidence, real HTTP/file execution evidence, and local EVM execution of the token lifecycle. Mainnet deployment, ENS commissioning, independent human review and sustained production economics remain operator-specific commissioning work.

## Repository atlas

| Location | Purpose |
| --- | --- |
| `src/alpha/` | Standalone CLI, operator interface, missions, review and evidence |
| `src/alpha/runtime/` | Adaptive planner, specialist transport, controlled actions, transaction executor and recovery |
| `examples/alpha/` | Mission, usage, pipeline and runtime configuration examples |
| `contracts/AlphaMissionEscrow.sol` | Canonical $AGIALPHA funded mission settlement |
| `contracts/AlphaNodeManager.sol` | Owner-administered identity and stake custody |
| `test/alpha/` | Mandatory standalone integration, failure and executable EVM tests |
| `scripts/demo-runtime.mjs` | Reproducible multi-process local runtime demonstration |
| `src/index.js`, `dashboard/` | Retained legacy infrastructure CLI and dashboard |
| `docs/manifesto.md`, `docs/archive/` | Original vision and historical material |

Installing this release does not deploy or upgrade contracts. Adoption of changed contract logic requires new deployments and explicit migration. Current release evidence governs capability claims; historical manifesto language is not validation.
