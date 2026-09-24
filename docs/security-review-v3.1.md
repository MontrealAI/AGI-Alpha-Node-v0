# v3.1 implementation review

<!-- markdownlint-disable MD013 -->

This is the release builder's implementation review and test plan. It is not an independent security audit and does not issue an external assurance signature.

| Boundary | Controls and validation |
| --- | --- |
| Mission source | Strict schemas, unique source IDs, freshness, bounded bytes, content-bound IDs and intersection with owner risk policy |
| Model input/output | HTTPS or loopback, explicit provider, bounded request/response/tokens/time, JSON-schema constraints, exact quotation validation; no model execution authority |
| Specialist work | Signature domains, input/recipient/capability/price bindings, caller allowlists, request locks, pre-inference reservations and refusal of failed-request retries |
| Reviewer evidence | Recomputed arithmetic/report, signed reviewer choice for new runs, expected-party verification, receipt checks and review/outcome signature binding |
| Measurements | Signed task/workload/acceptance/period contract, equal work units, complete declared overhead, quality status and content-hash verification |
| Learning/admission | Observed evidence only; excludes legacy, modeled, fixture, duplicate and overlapping observations; no expansion of owner authority |
| Payments | Existing durable signed-intent/nonce controls plus read-only re-auditing of finalized escrow state, canonical block inclusion and exact token transfer events |
| External assessments | Explicit owner allowlist, role separation, bounded expiry and binding to software/configuration; reviewer cannot attest their own independence |
| Operator interface | Authenticated loopback API, hostile-origin rejection, text rendering, private keys/raw transactions excluded, explicit incomplete qualification |
| Recovery | Worker locks, pause, encrypted backup/restore, retained reservations and restoration to a paused state |

Review findings addressed during implementation included insufficient reviewer-address binding in standalone exported evidence, missing identity verification before specialist spending, specialist reservations that could allow an interrupted computation to repeat, and model outputs passing structural checks while making unsupported semantic claims. The first three have code-level controls and regression coverage. Semantic correctness still requires independent evaluation; the release preserves a rejected model draft as evidence of that boundary.

Residual requirements include trustworthy host ownership, provider-side billing limits, source authenticity, human/organizational independence, contract deployment verification (including proxies), representative workloads and actual target-host recovery. Owner-signed ledger entries establish integrity, not external truth. Public RPC agreement can share failure modes. Existing mainnet contracts do not change when source code is released.

The dependency gate audits both root and subgraph lockfiles. Clean audit output only covers reported dependency advisories at the time of the scan. Repository branch-protection enforcement and a third-party source/contract audit are not established by this report.

Failed-attempt accounting is also checked: qualifications require observed cost coverage for runs and separate reviewer-signed expenses for uncommitted failures. Missing records block net-value qualification. Rejected work cannot claim accepted outputs or receive positive qualification credit. Duplicate expenses and reuse of an expensed mission are rejected. Expense invoices and assessor reports remain external evidence; their hashes and signatures alone cannot establish truth.
