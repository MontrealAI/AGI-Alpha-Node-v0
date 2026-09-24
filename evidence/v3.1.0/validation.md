# v3.1.0 qualification evidence

<!-- markdownlint-disable MD013 -->

This record reports executed release-builder checks, not an independent audit or production certification. [Machine-readable results and source hashes](validation.json) identify the tested implementation. The final GitHub Actions run on the tagged commit supplies the Linux/macOS/Docker publication evidence.

## Local verification

| Check | Result |
| --- | --- |
| Backend/integration | 560 passed; 11 inherited environment-dependent skips |
| Standalone subset | 117 passed; zero skipped (included in backend total) |
| Frontend | 1 passed |
| Coverage | 86.35% statements, 87.90% lines, 92.04% functions, 76.71% branches |
| Coverage gates | Unchanged: 85% statements/lines/functions, 60% branches |
| Full local CI | Documentation/link/dashboard lint, tests, coverage, Solidity lint/compile, subgraph code generation/build, dependency and policy gates passed |
| Type checking / dashboard build | Passed |
| Root and subgraph dependency audits | Zero reported advisories across runtime and development lockfiles |
| Clean source ZIP install | Production dependencies only; measured-work demo and CLI version passed on Linux x64 / Node 22.14.0 |

Coverage scope is alpha excluding CLI/web, network and telemetry. Passing coverage does not prove absence of defects. The local branch-gate command explicitly skips without CI metadata; branch policy is evaluated remotely.

New regression checks exercise general-source policy intersection, actual HTTP model transport with deterministic test responses, quotation/schema rejection, source and reviewer binding, failed inference reservations, peer process locks, paired outcomes, rejected work, expense signatures, duplicate/overlap exclusion, artifact byte verification, external assurance scope/expiry, qualification admission and fresh paid-claim auditing. Mandatory integrated token tests execute actual Solidity bytecode in a local EVM; ENS/RPC and economic inputs there are controlled fixtures.

## Actual execution outside test-response fixtures

The [model execution](repository-research/execution.json) performs two actual local inferences using pinned Qwen3-4B-Instruct-2507-Q4_K_M bytes and llama.cpp b11146. Separate specialist processes return signed research and adversarial drafts from actual v3.0 repository evidence. The final run took 200.369 seconds. Receipt verification passed, identical admission replayed without more model calls, and encrypted backup restored the same ledger head in a paused state. Its software fingerprint matches the final implementation above.

The [builder's semantic assessment](repository-research/assessment.json) identifies overclaims that format and citation validation cannot catch. The [smaller model's rejected draft](model-quality-rejection/assessment.json) is retained as developmental evidence; it precedes the final source fingerprint. Neither result has independent human acceptance. Model quotations authenticate neither source truth nor logical entailment.

The [measured-work run](measured-work/measurement.json) executes two supplied deduplication implementations on 5,000 generated records, checks the same 2,500 ordered unique outputs, obtains controlled signed review and applies an exact authorized algorithm change. Measured CPU use was 0.011137 seconds before and 0.000391 seconds after. The signed outcome and actual artifact bytes verified. This is one paired local measurement, not a representative production benchmark. Its illustrative USD-per-CPU-hour conversion is labeled `modeled`, excluded from observed-economics learning, and leaves production qualification incomplete.

## Release and commissioning boundary

The release workflow requires the macOS clean install, Linux checks and Docker smoke demonstrations before full verification and publication. Its ZIP has a per-file manifest and SHA-256 checksum. These remote results must be checked on the exact tagged commit; the local evidence does not substitute for them.

No owner mainnet commissioning, live token earnings, independent human assessment, sustained production profit or target-host service installation occurred in this process. The [current project status](../../docs/project-status.md) and [qualification procedure](../../docs/alpha-qualification.md) identify what remains open. The release intentionally does not label missing external evidence as completion or an objective “10/10.”
