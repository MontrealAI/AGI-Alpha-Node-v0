# Recovered vision and implementation assessment

<!-- markdownlint-disable MD013 -->

## Original intent

Baseline: commit `d5daf8f7c9a78d9eb8f2b41d49d03fbaf8426911`, package 1.1.0, dated 2026-01-01. Primary sources: `docs/manifesto.md`, `docs/economics.md`, `docs/identity.md`, `docs/alpha-wu.md`, the original README, and the implementation under `src/` and `contracts/`.

The original design describes an owner-controlled economic intelligence node: anticipate opportunities, plan bounded missions, coordinate specialists, record auditable work, validate outcomes and circulate $AGIALPHA through stake and rewards. ENS binds node identity. The owner retains control over risk, pause, identity, validators and treasury.

The historical documents embed AGI Jobs as a labor engine. For this release, the owner's explicit direction separates the $AGIALPHA project from AGI Jobs. Legacy adapters are preserved for compatibility but are not dependencies of the standalone node.

## What inspection established

| Surface | Baseline finding | v2.0.0 disposition |
| --- | --- | --- |
| Local intelligence | `simulateLocalInference` assigns heuristic confidence; the remote path probes HEAD but does not itself perform inference | Preserved as a legacy planning simulation; new standalone path performs auditable opportunity calculations and optional actual model POST requests |
| Autonomous alpha claims | No demonstrated self-running profitable enterprise or market outperformance | Removed from current capability claims; user assumptions, computed rankings and verified outcomes kept distinct |
| ENS | Resolver, identity and attestation implementations exist | New live node additionally binds mainnet ENS address resolution to its local signer before work; local names explicitly unverified |
| Stake | Deposits recorded; withdrawals did not debit balances; slashing only emitted events | Withdrawals and slashing debit account and aggregate stake; surplus sweeps cannot consume recorded stake |
| Identity routing | Reassigning a controller could leave an old reverse route | Old route cleared on registration and rotation |
| Rewards | Projection helpers and event hooks do not establish a funded payout | New canonical-token mission escrow reserves actual deposits and pays reviewed work once |
| Review | Legacy quorum and schema checks do not establish general independent task judgment | Designated separate signer reviews the exact evidence hash; detached review supported; human/organizational independence remains an operational requirement |
| P2P | Configuration and telemetry adapters plus synthetic load harness; no demonstrated deployed libp2p fleet | Retained as infrastructure/experiments; no deployed-scale claim |
| Dashboard and persistence | Existing React/Vite UI and SQLite domain persistence | Retained and regression-tested; standalone journal and CLI are separate from legacy dashboard data |
| CI and branch protection | Workflow files exist; branch enforcement cannot be inferred from documentation | Actual local results recorded; repository protection API returned 403, so enforcement is unverified |

## Baseline test assessment

A clean install initially failed on the inherited `better-sqlite3` 9.x native dependency in the available runtime. A Node.js 22 runtime and `better-sqlite3` 12.x with matching local build headers resolved installation. The original source was then tested in a separate baseline directory with that installation; this is not claimed as a pristine original-lockfile qualification.

The original source suite reported 436 passed, 1 failed and 11 skipped. The failure was a telemetry test depending on ambient OpenTelemetry sampling: this environment configured a 1% sample rate. Giving the test an explicit always-on sampler removes that nondeterminism without changing production sampling.

Ten legacy contract cases require Anvil and were skipped because Anvil is absent; one environment-dependent ENS case was also skipped. The new escrow and stake-accounting cases execute Solidity bytecode in an in-process Ethereum VM and are mandatory, with no Anvil dependency.

The initial production dependency audit reported 1 critical, 2 high and 12 moderate findings. Dependency updates and a regenerated lockfile address runtime advisories; see the final machine-readable audit and validation summary for the resulting count.

## Completed release boundary

The completed vertical slice is: authorized source inputs → policy-constrained analysis → optional model narrative → signed deliverable → persisted and restart-verified evidence → independent signed review → explicit funded escrow submission/review/claim or refund. The CLI also supports sequential inbox processing, pause/resume, diagnostics and export.

Evidence distinguishes real local execution, synthetic example data, fixture model transport, in-process EVM token transfers and live external operation. No live provider purchase, mainnet contract deployment, independent external human review or mainnet payout was performed in this build environment. Apple Silicon installation and unattended operation must still be commissioned on the target hardware.

This release does not complete the manifesto's open-ended research aspirations: self-improving general intelligence, decentralized specialist markets, autonomous reinvestment, profitable prediction or global network scale. It provides a bounded operational foundation that can be assessed on actual missions without treating aspirations or simulations as proof.

## Acceptance evidence

Use `evidence/v2.0.0/validation.json` for commands, counts, limitations and qualification status. The sample report is an analytical deliverable, not a claim that a buyer paid for it. Model HTTP fixtures test integration behavior rather than model quality. Token fixtures at the canonical address exist only inside the local VM; they are not mainnet $AGIALPHA balances.
