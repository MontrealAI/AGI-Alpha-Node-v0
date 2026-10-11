# v3.3.0 release qualification

This release adds public onboarding, documentation, reproducible deployment tooling, security dependency repairs and the telemetry fix from PR #497. It does not change Solidity source or commission Ethereum mainnet.

## Verification scope

- The public site uses local HTML/CSS/JS assets, English/French guidance, a fictional browser example and no model, wallet, upload or analytics requests.
- Onboarding and deployment-policy regression tests cover choices, back/restart, blocked storage, language changes, network policy, address/nonce/expiry/fee rejection and role separation.
- Hardhat builds use solc 0.8.37, optimizer 200 and Paris target. The local rehearsal exercises optimized deployment, runtime bytecode, token binding, pause, ownership handover and unauthorized-call rejection on chain 31337.
- Existing mandatory Alpha EVM tests remain the token settlement tests. Source verification, real RPC operation, funded mainnet settlement and independent review require owner-environment evidence.
- Linux/Node local checks are supplemented by release-blocking GitHub Linux, Docker and macOS jobs. The successful workflow attached to the released commit is the authoritative publication gate.

## Release gate

The full gate includes Markdown/link/Grafana lint, backend/frontend tests, coverage thresholds, Solidity lint and compilation, subgraph toolchain compatibility and build, both dependency audits, health/branch policy checks, the onboarding/deployment job, non-root Docker smoke checks and macOS standalone clean installation. No security threshold is reduced. Final observed results are recorded in `results.json` alongside this document; GitHub Actions verifies the published commit again.

The final CI job explicitly requires all nine prerequisite jobs to report success, including onboarding/deployment rehearsal. Failure, cancellation, skipped and missing results fail that gate. This matters for branch protection because a skipped GitHub job alone can otherwise be accepted as a completed required check.

The root and subgraph audits report zero vulnerabilities after repair. Markdown lint still uses the maintained engine and default/inline rules; a bounded file walker replaces vulnerable glob dependencies. The subgraph's `it-glob` override uses the supported v2 iterator API and is exercised by a compatibility check as well as the graph build.

## Explicit limits

No mainnet transaction, external signer, independently operated reviewer, sustained profitable workload, billion-user load test or complete WCAG certification was performed. Existing optional skipped tests remain reported; they are not presented as passes. The published site is an entry point to local software, not a hosted account or one-click managed node.

The archived infrastructure codex retains its diagrams. The other historical open PRs are not bulk-merged into the current standalone architecture. PR #497 is integrated with its original parent history while preserving the newer monitor shutdown fix.
