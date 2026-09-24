# v3.2.0 qualification evidence

Qualification executed on Linux x64 with Node.js 22.14.0 on 2026-09-24. [Machine-readable results](validation.json) include source SHA-256 values and the software fingerprint. These tests establish documented software boundaries; they do not certify completion of the full original economic-intelligence vision.

## Executed checks

| Check | Result |
| --- | --- |
| Full local CI | Passed: documentation, backend/frontend tests, coverage, Solidity lint/compile, subgraph build, dependency scans and health policy |
| Backend | 575 passed, 11 inherited environment-dependent skips |
| Standalone node subset | 132 passed, zero skipped; included in backend count |
| Frontend | 1 passed |
| Coverage | Statements 86.69%, lines 88.16%, functions 92.62%, branches 77.24%; existing thresholds unchanged |
| TypeScript and dashboard | Typecheck and production build passed |
| Dependency audits | Zero advisories in both root and subgraph lockfiles, including development dependencies |
| Finite allocation | 80 generated cases matched a separate dynamic-programming reference; 16-candidate boundary evaluated all 65,536 subsets |
| Clean archive installation | Fresh ZIP extraction, `npm ci --omit=dev`, three-family work demonstration and CLI version 3.2.0 passed |
| Real local model | Three actual calls in 17,999 ms, producing only selections of computed facts |
| Process and evidence lifecycle | Three signed specialist exchanges with a separate process, controlled reviews, verified exports and replay |
| Recovery | Encrypted backup/restore preserved the ledger head; restored node was paused |
| Local EVM integration | Both usage and structured-work paths completed reviewed action and five signed transactions; each fixture paid 100 token base units, staked 40 and retained 60 |

Coverage measures alpha core (excluding CLI/web), network and telemetry. CLI, UI, contracts and other infrastructure have separate regression checks. The local branch gate skipped because this environment had no CI branch metadata. The exact candidate and main commit must pass the repository's Linux, macOS and Docker gates before automatic publication. Remote results are attached to the release's tagged commit in GitHub Actions; they are not fabricated into this pre-publication record.

## Inspect the evidence

- [Allocation oracle cases](allocation-oracle.json): generated inputs and exact results, seed 77. The reference uses a separate dynamic-programming implementation; generated cases do not establish estimate quality.
- [Model execution](model-work/execution.json) and [builder assessment](model-work/assessment.json): exact provenance, per-family facts, verification, replay and recovery.
- Signed work outputs: [invoices](model-work/invoices/report.md), [allocation](model-work/allocation/report.md) and [data quality](model-work/quality/report.md), with source, evidence, JSON and CSV alongside each report.
- Local EVM records: [usage](closed-loop/usage/closed-loop.json) and [structured work](closed-loop/work/closed-loop.json). `fixture: true` explicitly identifies simulated providers/balances and economic observations. Contracts actually execute inside a local EVM; no mainnet transaction was sent.
- Dependency scans: [root](npm-audit-root.json) and [subgraph](npm-audit-subgraph.json).

The pinned model is Qwen3-4B-Instruct-2507 Q4_K_M, quantizer revision `a06e946bb6b655725eafa393f4a9745d460374c9`, GGUF SHA-256 `3605803b982cb64aead44f6c1b2ae36e3acdb41d8e46c8a94c6533bc4c67e597`, running in llama.cpp b11146. Weights are a separate download. The software fingerprint is `0x5809297a92d52f6c6b9088e0a5894d122c4450d18aec2a78fa52cd4df6e72087` over 153 files.

## Reproduce

```bash
npm ci
npm run ci:verify
npm run typecheck
npm run dashboard:build
ALPHA_QUALIFICATION_OUTPUT=/absolute/new/closed-loop ALPHA_ALLOCATION_OUTPUT=/absolute/new/allocation-oracle.json npm run test:alpha
npm run demo:work
```

Use the pinned model command in [verified work](../../docs/alpha-verified-work.md) for actual inference. `demo:work` alone uses deterministic computation and makes no model-inference claim. Random demonstration keys, timestamps and transaction hashes vary; checks compare the relevant computed results and signatures. Obtain expected signer addresses independently when verifying a third party's bundle.

## What remains unestablished

The three sources are controlled examples. Invoice discrepancy is not a refund; allocation benefit is a supplied estimate; data-quality findings apply only to supplied records and rules. Model selection of computed facts is structurally restricted and does not benchmark general reasoning or prove good prioritization. General research prose still has the semantic limitations documented in v3.1.

Review roles use separate controlled keys, not independent people. Reviewer-minute reservations are owner estimates. No spreadsheet application execution or save/reopen behavior was qualified. No owner live ENS commissioning, mainnet funding, independent source/contract or recovery audit, target-host service installation, sustained buyer acceptance or production profitability was established. The live-owner qualification gate correctly remained false. See [project status](../../docs/project-status.md) for the full remaining original scope.
