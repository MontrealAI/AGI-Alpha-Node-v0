# AGI Alpha Node v2.0.0 — Standalone Mission Edition

<!-- markdownlint-disable MD013 -->

This release gives the $AGIALPHA project a standalone operational mission loop. It separates the project from the legacy AGI Jobs integration, replaces simulated-success assumptions with explicit evidence states, and adds funded token settlement.

## Added

- `alpha-node` CLI: initialize, run, watch, status, doctor, pause, resume and export.
- Source-linked opportunity ranking with spending/downside limits, stressed economics and abstention.
- Optional real chat-completions HTTP inference with timeout, response-size and output-token bounds; failures never become simulated successes.
- Signed reports, replay-safe mission IDs, atomic persistence, tamper detection and verified restart.
- Separate reviewer authorization, detached review signing and import without sharing the node key.
- `AlphaMissionEscrow`: canonical $AGIALPHA funding, fixed node/reviewer/deadline, evidence-bound review, one-time claim, rejection/expiry refund, pause and protected reserves.
- Mandatory in-process EVM tests, including an analytical run whose actual signed evidence hash is submitted, reviewed and paid in the local VM.
- Installation, operations, backup, recovery, original-vision assessment and machine-readable validation evidence.

## Fixed

- Stake withdrawals and slashing now debit recorded balances and aggregate stake.
- Explicit account-debited owner custody transfer and surplus-only sweep.
- Stale identity mappings removed when a controller moves between ENS nodes.
- Telemetry test sampling no longer depends on host sampling configuration.
- Native SQLite runtime compatibility and production dependency audit findings addressed through dependency and lockfile updates.

## Upgrade notes

Node.js 22.14+ is required. The new `alpha-node` CLI is separate from the retained `agi-alpha-node` infrastructure CLI. Existing dashboard and job adapters retain their legacy scope.

Contract changes require new deployments and an explicit migration plan. `withdrawStake(recipient, amount)` now debits that recipient's recorded stake; use `withdrawStakeFor(account, recipient, amount)` for an owner-directed custody transfer. Slashing now reduces real accounting balances. Existing deployed bytecode is unchanged by this software release.

## Evidence and qualification

See `evidence/v2.0.0/validation.json` and the included command logs. The example inputs are synthetic. Local EVM token transfers and fixture HTTP requests are real test executions, but are not mainnet payments or paid-model validation. Separate signing keys in tests are test roles, not independent external reviewers.

Live ENS/operator commissioning, Apple Silicon unattended operation, actual provider billing, external independent review, mainnet deployment and funded settlement remain operator-environment qualification steps. The release does not claim profitability, general intelligence, autonomous reinvestment or demonstrated distributed network scale.
