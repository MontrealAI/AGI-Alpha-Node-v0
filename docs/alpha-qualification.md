# Measured work and operational qualification

<!-- markdownlint-disable MD013 -->

The node must distinguish a working implementation, a signed claim and evidence of useful operation. v3.1 makes those distinctions executable. A configurable evidence gate can refuse new work until the owner's measurements and external assessments satisfy its policy. Passing it does not certify general intelligence, guaranteed profit or complete project fulfillment.

## Measurement contracts

Before a mission runs, optionally include `measurement` in the mission:

```json
{
  "taskKey": "your-comparable-task-family",
  "method": "paired-value-v1",
  "unit": "USD",
  "periodSeconds": 86400,
  "workloadHash": "0xSHA256_OF_WORKLOAD_SPECIFICATION",
  "acceptanceHash": "0xSHA256_OF_ACCEPTANCE_CRITERIA"
}
```

Replace hash placeholders with 64 hexadecimal digits after `0x`. The signed contract binds the workload, acceptance criteria and observation duration. Only the same recommendation ID and identical measurement contract can share learning observations.

A new measurement supplies:

- `kind: "paired-value-v1"`, the exact `contract`, and `evidenceClass`: `observed`, `modeled` or `fixture`.
- `baseline` and `candidate`, each with UTC `startedAt`, `endedAt`, `workUnits`, `acceptedUnits`, `grossValueUsd` and `operatingCostUsd`.
- `overhead` containing every incremental category: `inferenceUsd`, `executionUsd`, `reviewUsd`, `infrastructureUsd`, `settlementUsd`, `otherUsd`.
- `humanMinutes`, including supervision and review; `artifacts` with content SHA-256 hashes and descriptions; `observedAt`; and explanatory `evidence`.

Use equal work-unit counts, exactly the contracted observation duration and nonoverlapping ordered windows. Operating costs belong in their respective window; incremental change costs belong in overhead, without double counting. Include labor at the agreed valuation. Explicit zero means the reviewer attests no cost in that category. Estimates, illustrative conversions and fixture values must not be labeled observed. Retain invoices, observations, valuation basis and acceptance results in the evidence artifacts.

The software computes the change in gross value plus operating-cost savings, then subtracts all incremental overhead. Negative improvements become costs, preserving losses. Quality passes only if every unit in both windows meets the contracted acceptance criteria. A positive monetary estimate cannot turn a quality failure into a successful learning observation.

On the reviewer machine, sign with `outcome-sign evidence.json measurement.json --out outcome.json`; import with `outcome-import outcome.json` on the node. Export the reviewed mission again before signing its outcome. Outcomes are immutable; corrections require new evidence and a new mission, while preserving the original history.

For a complete example, inspect the measurement inside [the measured-work bundle](../evidence/v3.1.0/measured-work/evidence.json). Its CPU times are observed, but its dollar equivalents are modeled, so the economic evidence class is `modeled`.

### Verify artifact bytes

Store each artifact as `<64-character-sha256>.bin` in a supplied artifact directory. Its hash is over the exact bytes; retain the original format/meaning in its description. Verify an exported outcome with:

```bash
npm run alpha -- verify-bundle evidence.json --expected-node 0xNODE_ADDRESS --expected-reviewer 0xREVIEWER_ADDRESS --artifacts /absolute/artifacts
```

Verification rejects missing files, symlinks, substituted content and more than 64 MiB of aggregate artifact data. Without `--artifacts`, the command verifies the signed references, not external file contents. Hashes do not prove truthful measurement or causal attribution.

## Learning and evidence admission

Learning excludes legacy outcomes, modeled/fixture economics, different contracts, overlapping candidate windows and repeated artifact sets. It uses a bounded window of observed comparable records, applies conservative probability/benefit caps and abstains after the configured consecutive-loss count. It never increases owner permissions. Retain enough disjoint observation periods to satisfy `adaptive.minSamples`.

Operational qualification additionally excludes candidate measurements predating admission, future-dated observations and records outside the lookback period. It counts all accepted-unit failures, negative net values and failed attempts as losing observations. Positive benefit from quality-failing work receives no credit in qualification net value. Its effort metric divides all reported human time by the number of positive-net, quality-passing results; failed work does not disappear from the numerator.

Run:

```bash
npm run alpha -- --home /absolute/private/node qualify --out /absolute/new/qualification.json
```

`--enforce` exits with code 2 when the configured gate is incomplete. The operator interface has the same check. No private keys, provider URLs or raw signed transactions appear in the report.

## Account for failures and missing measurements

Qualification requires eligible observed measurements for every run admitted in the lookback period (and every outcome reported in that period), plus signed expenses for every failed attempt without a committed run. Legacy, modeled, duplicate, pre-admission or missing measurements leave cost coverage incomplete. Unresolved attempts also block coverage. The net-value and loss-rate checks cannot pass while coverage is incomplete.

Rejected missions can receive v2 outcomes for cost accounting, but their candidate `acceptedUnits` must be zero. Do not erase a rejection or relabel a failed output as accepted. A failed attempt with a committed run uses that run's measurement instead of a second expense.

For a failure before a run was committed, use `operations` to obtain its cycle, then:

```bash
npm run alpha -- --home /absolute/private/node expense-request 0xCYCLE_HASH --out expense-request.json
```

The designated reviewer fills in actual total `costUsd`, total `humanMinutes`, the SHA-256 of the supporting cost records, observation time and explanatory notes. Include inference, execution, review, infrastructure, settlement and other costs; justify explicit zeros. Sign in the reviewer's protected environment with `ALPHA_REVIEWER_PRIVATE_KEY`:

```bash
npm run alpha -- expense-sign expense-request.json --out expense.json
npm run alpha -- --home /absolute/private/node expense-import expense.json
```

The ledger accepts one expense per failed attempt and prevents later reuse of that mission ID. New attempts need a new mission. Expenses reduce the period's net value and add human effort, including late-reported costs for earlier attempts. Their monetary truth and completeness still require honest review of the actual records. All figures are reviewer attestations, not an independent financial audit.

## Owner qualification policy

Copy [the qualification example](../examples/alpha/qualification.json) to the private node directory and choose thresholds appropriate to the workload. Defaults require five measured missions, nonnegative total net value, at most 20% losing/quality-failing observations, at most 15 human minutes per useful result, no review older than 72 hours, no unresolved operation/transaction, fresh live identity, one freshly audited payment and four external assessment roles. These are editable starter thresholds, not universal industry standards.

Fresh payment auditing checks finalized escrow state and its pinned bytecode, canonical-token bytecode, matching receipts from both RPC origins, canonical block inclusion, the mission payment event and the token transfer's sender/recipient/amount. Claims must correspond to useful measured missions. At most five recorded claims are audited per check. Merely recording a transaction hash cannot satisfy the gate. Both RPC endpoints and the deployed contract policy must be configured. RPC origin diversity does not prove separate operators or rule out common failure.

## External assessments

The owner allowlists an assessor address for each role in `qualification.json`:

| Role | Required external work |
| --- | --- |
| `security` | Review actual source, dependency/deployment boundaries, permissions and residual risks |
| `recovery` | Exercise backup, restore, interruption and reconciliation on the target deployment |
| `operations` | Assess the real host/service, provider limits, workload monitoring and operating period |
| `reviewer-independence` | Establish actual reviewer identity, organizational separation, competence and available capacity |

An assessor cannot be the node signer. The reviewer cannot attest their own independence. The same external assessor may cover multiple roles only when the owner has deliberately authorized that scope. A key is an identity reference, not proof that these assessments occurred.

Create a request on the node:

```bash
npm run alpha -- --home /absolute/private/node assurance-request --role security --out security-request.json
```

The assessor checks the actual deployment and findings, replaces the artifact-hash/statement placeholders, and reviews issuance/expiry. The artifact hash must identify their real assessment. Assessors can run `npm run alpha -- fingerprint` on the corresponding source package. Configuration assessment should occur through authorized host access or a protected review process; an opaque supplied digest alone is insufficient.

On the assessor's machine, supply `ALPHA_ASSESSOR_PRIVATE_KEY` through a protected environment and run:

```bash
npm run alpha -- assurance-sign security-request.json --out security-assurance.json
```

Import on the node with `assurance-import security-assurance.json`. Repeat for the other roles. An assessment is valid for at most 90 days and must match the allowlisted signer, node, software and configuration. Any source/lockfile or scoped configuration change invalidates the old scope. Signing a supplied request without doing the assessment would only create an unsupported assertion.

## Enable the admission gate

Commission the bounded pilot explicitly under owner limits. When evidence is established, set `requireQualifiedAdmission: true` in `engine.json` and obtain assessments bound to that final configuration. `operate` then requires a passing gate before admitting new missions. It continues reconciliation of already accepted actions and payments so an expired assessment cannot strand existing obligations. Use `pause` when you intend to stop all new execution.

The gate never expands permissions, pays an assessor or signs an assessment on somebody else's behalf. Live credentials, funded contracts, actual reviewers and target-host access must come from the deployment owner.

## v3.2 structured work and admission

Structured work sources can include the same optional `measurement` contract before admission. Their recomputable invoice/audit/allocation outputs establish computational correctness over supplied data; they do not establish buyer value, source truth or observed profit. See [verified work](alpha-verified-work.md).

The autonomous pipeline now reserves explicit reviewer minutes before inference and stops new work when review capacity or an age deadline is exhausted. Rejected measured work contributes to the learning loss history. Learning additionally excludes observations predating admission or dated in the future. General free-form model analysis remains unverified; work briefs instead select from independently computed facts.
