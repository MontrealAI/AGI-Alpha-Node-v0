# AGI Alpha Node — $AGIALPHA

<!-- markdownlint-disable MD013 -->

Version 2.1.0 · Bounded Operations Edition

An owner-controlled node for turning supplied evidence into ranked opportunities, signed analytical deliverables, independently signed reviews, and explicitly funded $AGIALPHA rewards.

This is the **$AGIALPHA project**. The standalone node does not require AGI Jobs, USDC, OpenClaw, or a job registry. Older registry adapters remain available as legacy integrations.

## Start in five minutes

Install Node.js 22.14 or newer, then run from this repository:

```bash
npm ci
npm run alpha -- init --ens demo.alpha.node.agi.eth
npm run alpha -- run examples/alpha/opportunity-scan.json
npm run alpha -- status
npm run alpha -- export alpha-opportunity-001 --out alpha-output
```

Open `alpha-output/report.md`. The example compares caching, batching, and speculative capacity expansion. It calculates expected and stressed net benefit, applies your spending and downside limits, and can abstain. The sample inputs are explicitly synthetic; the calculations, files, signatures, and integrity checks are real.

Local mode generates a private signing key in `.alpha-node/`. Its ENS name is an **unverified label**, and it cannot produce a live settlement plan. Never share this directory or fund a demonstration key.

## What the node does

| Capability | Behavior in this release |
| --- | --- |
| Intelligence | Deterministic, evidence-linked opportunity ranking; optional real HTTP model inference with bounded output and no action tools |
| Identity | Locally generated signing identity, or Ethereum mainnet ENS address verification against an operator-supplied key |
| Evidence | Signed report and input hashes in a verified, atomic, hash-linked local ledger |
| Independent review | Separate designated reviewer signs acceptance or rejection; detached review works without exposing the node key |
| Owner controls | Risk policy, pause/resume, sequential inbox processing, model configuration, export, and recovery |
| $AGIALPHA mechanics | Canonical-token, prefunded mission escrow with submission, review, claim, rejection and timeout refunds |
| Existing infrastructure | Legacy dashboard, telemetry, ENS attestation, persistence, treasury tools and registry adapters retained |

The model narrative is unverified analysis. Source hashes prove integrity, not truth. Separate signing keys prove role separation, not organizational independence. No guaranteed earnings, autonomous investment returns, token minting, general intelligence or deployed network scale are claimed.

## Operate your node

```bash
npm run alpha -- doctor
npm run alpha -- pause
npm run alpha -- resume
npm run alpha -- watch ./my-mission-inbox
```

Use `--home /absolute/private/directory` before the command for a separate node. Each mission ID is bound to its inputs: unchanged inputs replay safely, while changed inputs require a new ID. Stop `watch` with Ctrl+C. In-flight inference is bounded to 60 seconds; pause prevents its result from being committed if observed before the commit.

Follow [START HERE](START_HERE.md) for real inputs, providers, independent review, live identity and settlement. See the [recovery guide](docs/alpha-recovery.md) before moving or restoring a node.

## Funded rewards

`AlphaMissionEscrow.sol` implements a standalone funded reward lifecycle:

1. The owner approves the canonical $AGIALPHA token and funds a work ID for a named node, a different reviewer, and a deadline.
2. The node submits its signed evidence hash.
3. The designated reviewer approves that exact hash or rejects it.
4. Accepted work can be claimed exactly once to the named node. Rejected or expired unaccepted work can be refunded to its original funder.

Claims and refunds remain available when admission is paused. Owner surplus sweeps cannot consume reserved rewards. The escrow does not mint tokens and is **not deployed by installing this package**.

The revised `AlphaNodeManager.sol` now debits stake on withdrawal and slashing and clears stale identity routes. Its event-only work-unit hooks are not a funded reward system. New contract deployments and migration planning are required to adopt changed contract logic; an existing deployment is not upgraded automatically.

## Validate

```bash
npm run test:alpha
npm test -- --maxWorkers 2 --minWorkers 1
npm run ci:solidity
npm run typecheck
npm run dashboard:build
npm run ci:security
```

Read the [vision and implementation assessment](docs/alpha-assessment.md), [release evidence](evidence/v2.1.0/validation.md), and [release notes](RELEASE_NOTES.md). Local EVM token tests are not mainnet settlements; fixture HTTP tests are not paid-provider validation. Live ENS, operator keys, real reviewers and actual treasury funding must be commissioned in the operator's environment.

## Repository atlas

| Location | Purpose |
| --- | --- |
| `src/alpha/` | Standalone node, CLI, analysis, signatures, review and settlement plans |
| `examples/alpha/` | Editable mission input example |
| `contracts/AlphaMissionEscrow.sol` | Funded $AGIALPHA mission settlement |
| `contracts/AlphaNodeManager.sol` | Owner-administered identity and stake custody |
| `test/alpha/` | Node, HTTP transport and executable local EVM tests |
| `src/index.js` | Legacy infrastructure CLI |
| `dashboard/`, `observability/` | Legacy operator dashboard and telemetry |
| `docs/archive/README-v1.1.0.md` | Historical presentation, preserved for context |

The [original manifesto](docs/manifesto.md) is a vision document. The implementation assessment and release evidence govern capability claims for this version. GitHub workflow definitions are included; branch-protection enforcement is a repository setting and is not inferred from badges.

## Bounded operations in v2.1

The node can now discover caching experiments from fresh usage measurements, reserve daily execution capacity, deliver signed reports, accept asynchronous reviews, and track reviewer-attested outcomes. A loopback operator interface exposes controls and evidence without exposing signing keys. See [operations and recovery](docs/alpha-operations.md).

This release does not complete the repository’s open-ended AGI vision. It does not autonomously deploy optimizations, prove profitability, operate a specialist peer marketplace, or reinvest funds. Model inference and mainnet settlement require separately configured live services.
