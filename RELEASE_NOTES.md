# AGI Alpha Node v3.0.0 — Integrated Node Edition

<!-- markdownlint-disable MD013 -->

This major release completes the concrete standalone node workflow for **$AGIALPHA**, independently of AGI Jobs. The original planner, specialist, sentinel, evidence and evolution pillars now have connected executable implementations and explicit acceptance evidence.

## Delivered

- Task-scoped planning from usage observations and accepted signed outcomes, conservative adaptation, adverse scenarios, loss abstention and durable plan replay.
- Authenticated specialist offers/requests/results over real HTTP, capability/price routing, caller allowlists, capacity limits and persistent idempotency.
- Exact reviewed JSON configuration actions with file preconditions, synchronized backups, health checks, rollback and pause. The signed report displays the proposed action.
- Canonical-token transaction execution with fresh live identity checks, independently configured RPC origins, finalized block agreement, deployed-bytecode pins, durable signed intents, nonce recovery and gas limits.
- EIP-712 reviewer acceptance relay in the escrow, verified payment receipts, exact allowances and capped staking with a liquid reserve.
- Guided setup, integrated autopilot/operator controls, runtime activity, encrypted backup/restore and Linux/macOS service configuration.
- Actual local-model inference evidence, a separate-process runtime demonstration and an integrated discovery/action/payment/outcome test that executes Solidity bytecode.
- Updated development toolchain and lockfile, removal of unused Grafana toolkit dependencies, and a full root runtime/development dependency security gate. Also fixes a legacy monitor shutdown race and bounds verifier request bodies.

## Qualification

See [the evidence report](evidence/v3.0.0/validation.md) and the GitHub Actions run on the release commit. Publication requires Linux tests, coverage, documentation, security, Solidity compilation, subgraph build, non-root Docker smoke tests and a clean macOS standalone run. Source archives include a per-file manifest and SHA-256 checksum.

Evidence distinguishes real HTTP/file/model execution, synthetic economic observations, fixture ENS/RPC responses, local EVM token transfers and unperformed production commissioning. The model run used pinned Qwen3-0.6B-Q8_0 bytes with llama.cpp b11146. No live mainnet deployment/payment, independently operated human review, target-host service installation or sustained profitable workload was performed by this release process.

## Upgrade

Read [recovery and migration](docs/alpha-recovery.md) before upgrading. Stop workers and retain a complete encrypted backup plus an external trusted ledger-head checkpoint. v3 reads prior schema-2 history; older executables cannot read new runtime events. Rollback requires the corresponding pre-upgrade state and reconciliation of later external actions/transactions.

The default `npm start`, `agi-alpha-node` executable and Docker entrypoint now select the standalone runtime. Legacy infrastructure remains available as `npm run legacy`, `agi-alpha-infrastructure` and `deploy/docker/Dockerfile.legacy`. The test/build toolchain is upgraded to Vitest 5/Vite 8; use Node.js 22.14+ and the committed lockfile. Changed escrow bytecode requires a new verified deployment; installation does not upgrade existing contracts.

## Scope of the result

The implemented planner is task-scoped; specialists offer three deterministic capabilities and do not receive automatic peer payments; external execution is an explicitly authorized scalar JSON change. Adaptation cannot expand owner permissions or supplied benefit/probability estimates. The release does not establish general AGI, guaranteed returns, a global permissionless marketplace, unlimited scale or an objectively perfect “10/10.” Mainnet commissioning requires the owner's actual ENS identity, dedicated funded signer, deployed contracts, independent reviewer and workload.
