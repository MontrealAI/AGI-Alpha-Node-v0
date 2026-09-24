# AGI Alpha Node v3.2.0 — Verified Work Edition

<!-- markdownlint-disable MD013 -->

v3.2 gives the standalone **$AGIALPHA** node independently recomputable analytical deliverables, alongside the existing reviewed execution and funded settlement lifecycle. This project remains separate from AGI Jobs.

## Delivered

- Invoice reconciliation with exact integer amounts, usage/billing discrepancies, missing-rate handling and repeated-reference detection.
- Exhaustive resource allocation over up to 16 supplied candidates, constrained by capital, compute and reviewer minutes, with deterministic tie-breaking and a declared optimum confined to the supplied model.
- Explicit data-quality audits with row-level evidence for required fields, uniqueness, numeric ranges and allowed values.
- Optional model briefs that select only existing computed facts. The verifier renders their text; unsupported model-authored prose cannot enter this brief.
- Signed work results, complete JSON/CSV exports, independent recomputation, authenticated operator downloads and artifact integrity checks.
- Reviewer-time reservations before autonomous inference, daily/pending time budgets and overdue-review admission blocks.
- Learning fixes: rejected measured work counts as a loss; pre-admission and future observations are excluded.
- Three-family demonstrations with a separate specialist process, controlled review, replay and encrypted recovery; real local-model briefs; and structured work exercised through local EVM settlement and capped reinvestment.

## Validation and packaging

[Release evidence](evidence/v3.2.0/validation.md) records executed checks, source fingerprints, exact limitations and reproducible commands. Publication requires Linux tests and coverage, documentation/security checks, Solidity/subgraph builds, macOS clean installation, Docker demonstrations and full combined verification. The ZIP includes a per-file manifest and checksum. Model weights remain a separate pinned download.

The model run prioritizes computed facts and therefore does not measure general reasoning or unrestricted hallucination rates. Example invoices, benefits, reviewer roles and local EVM balances are explicitly controlled fixtures. No buyer payment or real economic gain is asserted.

## Install and upgrade

Use Node.js 22.14+, `npm ci`, then `npm run demo:work`. Read [verified work](docs/alpha-verified-work.md) for source formats, outputs, verification, model configuration and reviewer budgets.

Before upgrading, stop workers and retain an encrypted backup plus an external ledger-head checkpoint. Existing history remains readable, but new work fields and briefs require v3.2. Rollback needs the corresponding pre-upgrade state and external-action reconciliation. Review the new reviewer-time limits; legacy/manual pending records use a 15-minute estimate. Rejections now affect learning. Contracts are unchanged from v3.0/v3.1; installation does not deploy or upgrade them.

## Remaining scope

The [project status](docs/project-status.md) identifies unfinished original outcomes. Work correctness is conditional on supplied data, rules and estimates. General model research remains unverified. Live ENS commissioning, funded mainnet operation, independent security/recovery assessments, sustained profitable workloads and broader autonomous intelligence were not established by this release process. They remain required evidence for the full original vision; the release does not claim an objective “10/10.”
