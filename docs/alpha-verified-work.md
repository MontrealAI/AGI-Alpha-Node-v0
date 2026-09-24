# Verified work for the $AGIALPHA node

<!-- markdownlint-disable MD013 -->

v3.2 adds three usable analytical work families. The node computes their results, binds them into its signed mission, obtains review and follows the same owner-controlled execution and token-settlement lifecycle. Optional model briefs select existing computed facts. They cannot introduce additional factual claims or authorize actions.

## First run

Use Node.js 22.14+ and npm 10+, then:

```bash
npm ci
npm run demo:work
```

Open `alpha-work-output/invoices/report.md`, `allocation/report.md` and `quality/report.md`. Each directory also contains its source, signed evidence, complete `work-result.json` and `work-results.csv`. The demonstration uses supplied examples, a separately keyed specialist process, controlled reviewer signatures, replay and encrypted recovery. No real invoice, buyer payment or economic gain is asserted.

## Choose the work

| Work family | Required input | Result |
| --- | --- | --- |
| Invoice reconciliation | Period, service rates, usage rows and invoice lines | Quantity differences, exact expected/billed amounts, monetary discrepancies, missing rates, line-price mismatches and repeated invoice references |
| Resource allocation | Up to 16 candidates with declared benefit, cost, risk reserve, compute and review needs; owner capacities | Exact maximum declared net under capital, compute and reviewer-time limits, with the chosen rows and number of evaluated subsets |
| Data quality | Up to 500 identified rows and 30 explicit rules | Row-level required-field, uniqueness, numeric-range and allowed-value violations |

Start from [invoice](../examples/alpha/work-invoices.json), [allocation](../examples/alpha/work-allocation.json) or [quality](../examples/alpha/work-quality.json). Replace example data with authorized records. `observedAt` must describe a real observation; changing a timestamp does not make old data current. A source envelope has `schema: 1`, `observedAt` and `work`.

Amounts in these work specifications use **integer micro-USD strings**: `"1000000"` means one USD. They are dollar accounting units, not ERC-20 token base units. Calculations use arbitrary-precision integers. Inputs accept nonnegative integers of up to 18 digits; differences may be negative. Quantity and rate multiplication does not pass through floating-point arithmetic.

Invoice rows have unique local `id` values; `reference` preserves the original invoice/line reference so repeated references can be flagged. Expected totals use supplied usage at supplied rates. Duplicate alerts do not add their amounts a second time. Unknown rates remain unknown. Taxes, credits, missing usage and contractual exceptions require reconciliation by the reviewer. A discrepancy is not automatically a recoverable refund.

Allocation subtracts both declared cost and the full risk reserve from declared benefit, while cost plus risk reserve also consumes capital capacity. Benefits are estimates. The solver evaluates every subset within its 16-candidate limit. Ties prefer lower capital, review time, compute, item count, then lexicographic IDs. Its optimality claim applies only to that finite input and objective. It does not schedule tasks, buy compute or establish realized returns.

Data-quality uniqueness is type-sensitive and marks subsequent occurrences of a repeated nonempty value. Numeric ranges reject nonnumeric values but ignore missing values; pair them with a required rule when missing values are unacceptable. An audit that correctly finds invalid data can itself be successful work. Define acceptance by the accuracy and usefulness of its findings, not by the absence of data defects.

## Configure your node

```bash
npm run alpha -- --home /absolute/private/node setup --ens yourname.alpha.node.agi.eth --reviewer 0xREVIEWER_ADDRESS --work /absolute/source.json
npm run alpha -- --home /absolute/private/node operate
npm run alpha -- --home /absolute/private/node serve
```

Setup selects `sourceKind: "work"` and zero minimum expected net for this analytical workflow. The mission claims no forecasted financial benefit. Explicit provider reservations and review limits still apply. Setup enables neither transactions nor external actions. Review those settings before enabling continuous operation.

The operator interface displays pending and daily reserved reviewer minutes and provides JSON/CSV downloads. A configured `evidence-analysis` specialist computes the same structured result through the signed peer protocol; the coordinator independently recomputes it. Authorized specialists receive the complete mission data. Work briefs send computed facts to the configured inference provider. Share inputs and exported bundles only with authorized recipients.

The full input is limited to 800 KB, with at most 500 invoice rows per input list or 500 audit rows of at most 30 fields. General sources allow 1 MB. Specialist requests retain their smaller 250 KB envelope limit. Large work inputs can run locally; configured specialist requests exceeding their limit fail explicitly. Verified-computation caches are keyed by complete input hashes, return isolated copies, and are bounded to 128 entries and 8 MB of serialized results. A process restart recomputes them.

## Model assistance with bounded claims

For a work mission, the provider returns only a strict `factIds` list. The node rejects extra fields, unknown or duplicate IDs and truncated responses. It renders the selected text from the independently computed result. An empty list is explicit abstention. A model cannot use this brief to insert an invented conclusion, profit claim, source quotation or instruction.

Selecting a true fact does not prove good prioritization or sufficient coverage. Always inspect the full result and the supplied data. General `research-synthesis` and `adversarial-review` specialists retain their separate, unverified prose behavior. v3.1's documented semantic errors remain relevant to those modes; this release does not claim to solve unrestricted model hallucination.

## Independent verification

```bash
npm run alpha -- verify-work source.json work-result.json
npm run alpha -- verify-bundle evidence.json --expected-node 0xNODE_ADDRESS --expected-reviewer 0xREVIEWER_ADDRESS --work-dir /absolute/export
```

The first command independently recomputes the work over the supplied source. It does not authenticate that source. The second verifies the signed mission, computed result and exact CSV/JSON artifacts. Obtain expected addresses independently. The evidence binds the input and full computed result even when the brief displays only a subset of facts.

JSON is the lossless machine-readable result. CSV is a text-oriented convenience view. Fields are quoted and embedded quotes escaped; formula-like prefixes, control characters and full-width variants receive a literal `TEXT:` prefix followed by a space. This intentionally changes their CSV display value. Use JSON when exact typed values are needed. Spreadsheet interpretation and later editing vary by application; see [OWASP's CSV guidance](https://owasp.org/www-community/attacks/CSV_Injection). No spreadsheet execution or save/reopen behavior was qualified in this build.

## Reviewer time and learning

Autonomous admission now requires an available reviewer-time reservation in addition to the pending-count and inference budgets. `reviewMinutesPerMission`, `maxPendingReviewMinutes`, `maxDailyReviewMinutes` and `maxReviewAgeHours` are visible in the pipeline example. New reservations are signed before inference. Accepted reviews release pending capacity; daily reservations, including failed attempts, remain charged. An overdue review stops new admission. These are owner estimates, not proof of actual staffing or attendance. Legacy reservations/manual pending missions use a documented 15-minute estimate.

For outcome-based learning and economic qualification, optionally add a `measurement` contract to the work source envelope as described in [measurement and qualification](alpha-qualification.md). It is bound before admission. Record actual comparable observations and all costs after work. The work's zero screening benefit must not be presented as an economic forecast. Rejected v2 work with zero accepted outputs now counts as a loss in learning. Pre-admission and future observations do not count. Comparable contracts and disjoint observations are still required.

## Reproduce the real-model run

Use the pinned 4B model and llama.cpp build documented in [mission intelligence](alpha-intelligence.md), then:

```bash
node scripts/qualify-local-model.mjs --work --threads 8 --timeout-ms 180000 --server /absolute/llama-server --model /absolute/Qwen3-4B-Instruct-2507-Q4_K_M.gguf --model-sha256 3605803b982cb64aead44f6c1b2ae36e3acdb41d8e46c8a94c6533bc4c67e597 --revision a06e946bb6b655725eafa393f4a9745d460374c9 --runtime "llama.cpp b11146" --out /absolute/new/evidence
```

The three model calls prioritize already computed facts. The signed exports, specialist exchanges, replay and recovery are real local execution; the source records and review roles are examples. The [release evidence](../evidence/v3.2.0/validation.md) separates those facts from unperformed mainnet commissioning, independent assurance and measured production economics.
