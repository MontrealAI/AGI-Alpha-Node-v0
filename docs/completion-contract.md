# Completion contract for the standalone $AGIALPHA node

<!-- markdownlint-disable MD013 -->

The owner requested completion of the repository's concrete original node architecture, separate from AGI Jobs. A passing narrow demonstration is insufficient. This checklist keeps the remaining engineering work in scope; release claims must follow executable evidence.

| Original pillar | Required completed behavior | Evidence required |
| --- | --- | --- |
| World-model planner | Build a task-scoped model from observations and signed outcomes; generate and stress-test candidate plans; select only actions admitted by owner policy | Tests of learning, uncertainty, adverse scenarios, abstention, policy bounds and deterministic replay |
| Specialist mesh | Discover configured signed specialist offers; authenticate requests/results; route by capabilities and bounded price; survive interruption without duplicate work | Real HTTP exchanges between separately keyed processes, signature/replay/expiry/authorization tests and persisted receipts |
| Antifragile sentinel | Enforce budgets, capacity, pause, timeouts, execution permissions and failure backoff; tighten behavior after adverse outcomes | Failure injection, conservative adaptation and recovery tests |
| Compliance ledger | Bind inputs, plans, specialist outputs, executed changes, reviews, outcomes and transactions in a verifiable durable record | Tamper detection, identity binding, restart and rollback evidence |
| Autopilot evolution | Update bounded strategy parameters from accepted measured outcomes; execute authorized changes; settle accepted work and reinvest only verified receipts within explicit owner limits | End-to-end closed-loop execution, receipt validation, nonce/idempotency recovery, treasury conservation and capped reinvestment tests |
| Identity and token mechanics | ENS-controlled live identity, canonical $AGIALPHA, funded escrow, stake conservation and separate review authority | Local VM and RPC integration evidence plus an explicit live commissioning report |
| Operator experience | Guided configuration, observable phase/status, operator controls, private keys outside UI, backup/restore and platform service configuration | CLI/API/UI tests, clean-install checks and recovery drills |
| Release engineering | Reproducible source package, clean dependency installation, security review and gated publication | Published CI and archive/manifest verification |

General intelligence, inevitable profitability, guaranteed market outperformance and unlimited scale are research or outcome claims, not software acceptance criteria. Implementing the concrete pillars does not establish those claims. Live commissioning additionally requires an actual owner deployment, authorized keys, funds, independent reviewers and measured operation; absent evidence must remain marked unverified.

A next release is gated on the integrated software behavior above, not on silently dropping unfinished pillars from scope.
