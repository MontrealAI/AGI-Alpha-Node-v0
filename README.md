# AGI Alpha Node — $AGIALPHA

<!-- markdownlint-disable MD013 -->

Version 3.2.0 · Verified Work Edition

An owner-controlled economic intelligence node: collect authorized observations, plan and stress-test opportunities, coordinate authenticated specialists, obtain signed review, execute an exact authorized change, settle funded $AGIALPHA work, and reinvest verified receipts within owner limits.

This is the **$AGIALPHA project**. The default runtime requires no AGI Jobs registry, USDC or OpenClaw. Older infrastructure adapters remain separately accessible through `npm run legacy -- --help`.

## Start in five minutes

Install Node.js 22.14+ and npm 10+, extract the release ZIP and run:

```bash
npm ci
npm run demo:work
```

Open `alpha-work-output/invoices/report.md`, `allocation/report.md` and `quality/report.md`. The node reconciles invoice/usage records, solves a resource allocation and audits data quality, then exports signed evidence and complete JSON/CSV results. The demonstration uses supplied examples, a separately keyed specialist process, controlled reviewer signatures, replay and encrypted recovery. No funds are spent. Optional model briefs prioritize computed facts without adding free-form claims. See [verified work](docs/alpha-verified-work.md).

Run `npm run demo:measured` for the actual local CPU comparison with explicitly modeled dollar values, or `npm run demo:runtime` for the earlier runtime demonstration.

For your own node, follow [START HERE](START_HERE.md) and the [integrated runtime guide](docs/alpha-runtime.md).

## Implemented architecture

| Pillar | Working behavior |
| --- | --- |
| Task-scoped intelligence | General evidence-backed missions and usage-derived candidates, explicit economic assumptions, scenario stress tests, abstention and conservative adaptation from accepted signed outcomes; optional actual model inference |
| Specialist mesh | Configured peer discovery, signed offers/requests/results, capability and price selection, caller allowlists, capacity bounds and persistent replay protection |
| Sentinel and owner control | Cost reservations, pending-review admission, exact action permissions, pause, backoff, loss thresholds, health verification and rollback |
| Evidence ledger | Signed hash-linked records bind observations, plans, specialist results, reports, reviews, actions, outcomes and transaction receipts |
| Execution and evolution | Reviewed scalar JSON configuration changes; subsequent comparable signed measurements tighten future estimates |
| Identity | Local signing identity or mainnet ENS address verification, repeated before live work and settlement |
| $AGIALPHA | Prefunded canonical-token escrow, signature-relayed reviewer acceptance, exact-once claims, finalized receipt checks and capped staking of verified receipts |
| Operator experience | Guided setup, authenticated loopback interface, CLI, encrypted backup/restore and Linux/macOS service configuration |

Each capability has explicit limits. Specialists offer three deterministic analytical capabilities plus schema-constrained research synthesis and adversarial review; their quote is not an automatic peer payment. The adaptive model learns only from observed, comparable, reviewer-signed paired measurements and can only tighten supplied estimates. Modeled economics, fixtures, overlapping windows and duplicate artifact sets are excluded. Execution is an owner-selected configuration change with health checks. These concrete implementations do not establish general intelligence, guaranteed financial alpha, a permissionless global marketplace or unlimited scale.

## New in v3.2

Three structured work families produce independently recomputable results: invoice reconciliation, constrained resource allocation and data-quality audits. Work briefs use model-selected facts rendered by the verifier, with no model-authored factual prose. Exported JSON/CSV is bound to the signed mission. Autonomous inference reserves reviewer minutes and stops on overdue reviews. Rejected measured work now informs learning; pre-admission and future observations are excluded.

See [verified work](docs/alpha-verified-work.md), [measurement and qualification](docs/alpha-qualification.md), and [project status](docs/project-status.md).

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

See [qualification evidence](evidence/v3.2.0/validation.md), [recovered vision and assessment](docs/alpha-assessment.md), [release notes](RELEASE_NOTES.md) and [backup/recovery](docs/alpha-recovery.md). The package contains real local-model inference evidence, real HTTP/file execution evidence, and local EVM execution of the token lifecycle. Mainnet deployment, ENS commissioning, independent human review and sustained production economics remain operator-specific commissioning work.

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
