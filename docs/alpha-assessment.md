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

## Historical v2.0.0 release boundary

The completed vertical slice is: authorized source inputs → policy-constrained analysis → optional model narrative → signed deliverable → persisted and restart-verified evidence → independent signed review → explicit funded escrow submission/review/claim or refund. The CLI also supports sequential inbox processing, pause/resume, diagnostics and export.

Evidence distinguishes real local execution, synthetic example data, fixture model transport, in-process EVM token transfers and live external operation. No live provider purchase, mainnet contract deployment, independent external human review or mainnet payout was performed in this build environment. Apple Silicon installation and unattended operation must still be commissioned on the target hardware.

This release does not complete the manifesto's open-ended research aspirations: self-improving general intelligence, decentralized specialist markets, autonomous reinvestment, profitable prediction or global network scale. It provides a bounded operational foundation that can be assessed on actual missions without treating aspirations or simulations as proof.

## Acceptance evidence

Use `evidence/v2.0.0/validation.json` for commands, counts, limitations and qualification status. The sample report is an analytical deliverable, not a claim that a buyer paid for it. Model HTTP fixtures test integration behavior rather than model quality. Token fixtures at the canonical address exist only inside the local VM; they are not mainnet $AGIALPHA balances.

## Historical v2.1.0 reassessment

That release added usage-derived discovery, a bounded scheduler, durable reservations, asynchronous review attestations, reviewer-signed outcome records, finalized multi-endpoint escrow observations, and a local operator interface. See [operations](alpha-operations.md) and [v2.1 qualification](../evidence/v2.1.0/validation.md).

| Original goal | Current evidence and remaining gap |
| --- | --- |
| Anticipate opportunities | Fresh structured usage can generate caching experiments; no broad market discovery or validated forecasting |
| Intended intelligence | Deterministic economic ranking and optional model narrative; live model quality and general world-model planning remain unqualified |
| Specialist coordination | Separate reviewer file exchange works asynchronously; no implemented decentralized specialist marketplace |
| Antifragile owner controls | Budget reservations, pending-review admission, pause, locks, backoff and circuit breaker; provider billing and production infrastructure need external controls |
| Learn from outcomes | Immutable reviewer measurements and projection comparisons; no automatic model/policy learning or reinvestment |
| Token mechanics | Local VM tests of prefunded $AGIALPHA escrow and corrected stake accounting; no verified production deployment or mainnet payment |
| Operator experience | Real CLI and authenticated local interface tested through HTTP and DOM; Mac installation, visual browser qualification and long-running service commissioning remain unperformed |

The project remains short of the full original vision. A release number and passing tests cannot establish general intelligence, independent people, profitability or production readiness without the corresponding external evidence.

## v3.0.0 integrated completion assessment

The [completion contract](completion-contract.md) restores every concrete original pillar to the engineering scope. The standalone path now joins observations, adaptive planning, specialist coordination, reviewed execution, signed outcomes and bounded token reinvestment. The retained AGI Jobs adapters are optional legacy infrastructure and do not run in this path.

| Original pillar | v3 implementation and qualification | Evidence boundary |
| --- | --- | --- |
| World-model planner | Task-scoped outcome model, prior-weighted probability, conservative benefit adjustment, four adverse scenarios, loss abstention and durable plan replay | Measured input validity and causal forecasting are not established by arithmetic or signatures |
| Specialist mesh | Real separately keyed HTTP service, authenticated offers/requests/results, deterministic validation, price/capability routing, reservations and replay | Configured peers and three implemented capabilities; not a deployed global permissionless market or automatic peer billing |
| Antifragile sentinel | Daily run/action/gas limits, review capacity, pause, timeouts, loss thresholds, failure backoff, file health checks and rollback | External provider billing and host security require operator controls |
| Compliance ledger | Signed plans, reports, exact action descriptors, peer receipts, outcomes and transaction lifecycle; encrypted recovery | Integrity and role separation do not prove source truth, human independence or statutory compliance |
| Autopilot evolution | Conservative adaptation from accepted signed outcomes; actual reviewed configuration execution; verified payment receipt followed by bounded allowance/stake | Task-scoped strategy adaptation, not autonomous general self-improvement or proven profitability |
| Identity and token mechanics | Fresh live ENS gate, canonical token, bytecode pins, dual-origin finalized reads, EIP-712 review relay and five signed transactions executed against Solidity in a local VM | Fixture ENS/RPC/finality and mock token inside the VM; no claim of live mainnet earnings |
| Operator experience | Guided setup, explicit report authorization, private loopback interface, runtime activity, encrypted backup/restore and platform service files | Target-host service installation and sustained operation still need owner commissioning |
| Actual inference | Normal provider path executed against a pinned local Qwen GGUF and llama.cpp build; narrative and token usage archived | One real-model integration run on synthetic economics; no paid-provider or broad intelligence certification |

See [v3 qualification](../evidence/v3.0.0/validation.md) for actual results and [runtime operations](alpha-runtime.md) for reproducible setup. Current software behavior is assessed against explicit acceptance criteria. Mainnet contracts, live owner ENS, external human reviewers, a real workload and a sustained economic outcome cannot be supplied by a release number; their commissioning record remains open.

## v3.1 follow-through

The recovered vision above remains the scope reference. v3.1 adds general mission sources, two real model specialist roles, paired observed measurement contracts, conservative comparable learning, failed-attempt cost accounting, independently verifiable bundles and an owner-configured qualification gate. See [current project status](project-status.md) for implemented capabilities and the remaining external and research outcomes. Neither CI success nor a release number establishes live commissioning, profitable autonomy or a perfect score.
