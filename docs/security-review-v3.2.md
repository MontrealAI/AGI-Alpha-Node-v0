# v3.2 implementation review

<!-- markdownlint-disable MD013 -->

This release-builder review is not an independent source or contract audit. Contracts and settlement authority remain unchanged.

| Boundary | Implemented check |
| --- | --- |
| Structured input | Strict schemas, unique IDs, nonnegative integer monetary strings, bounded rows/rules/candidates/bytes and complete input hashing |
| Computation | Arbitrary-precision monetary arithmetic; exhaustive finite allocation with deterministic ties; data rules without eval or generated code |
| Model brief | Only existing fact IDs accepted; unknown/duplicate IDs and extra fields rejected; actual text rendered from recomputed facts |
| Evidence | Result stored in signed analysis; verifier recomputes it; reviewer verifies the expected parties, result and report |
| Exports | Exact JSON/CSV verification, regular-file bounds, symlink rejection and formula-like CSV values rendered with a literal text prefix |
| Computation cache | Complete input hash key, isolated copies, 128-entry/8-MB bounds; no trust in a persisted cache |
| Review admission | Signed minute reservations before inference; pending/daily time limits and overdue-review rejection; failed reservations retained |
| Learning | Rejected observations count as losses; pre-admission and future measurements excluded; existing contract/overlap/quality controls retained |
| Operator | Authenticated result downloads, text-only rendering and no signing keys in responses |
| Recovery | Structured results/briefs and peer receipts survive encrypted restore with an identical ledger head and paused state |

Adversarial regression cases include malformed work IDs and values, floating-point boundary amounts, cache mutation, untrusted field names, fabricated fact IDs and prose, substituted exports, artifact symlinks, formula/control/full-width CSV prefixes, reviewer saturation and rejected/future historical learning records. Finite allocation is compared with a separate dynamic-programming oracle across 80 generated cases. This checks the implementation, not the truth of candidate benefits or buyer demand.

CSV is a viewing format with literal `TEXT:` prefix followed by a spacees on risky values; JSON preserves exact values. No universal spreadsheet interpretation or save/reopen behavior is claimed. The export approach and remaining application differences are documented against [OWASP CSV guidance](https://owasp.org/www-community/attacks/CSV_Injection).

Residual requirements remain authentic source records, adequate rules and acceptance criteria, honest cost measurements, competent independent reviewers, owner mainnet deployment/funding, target-host commissioning and sustained economics. General research-model prose remains unverified. The node does not execute model-generated code or gain authority from its own predictions.
