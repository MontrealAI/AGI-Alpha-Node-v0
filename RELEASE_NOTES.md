# AGI Alpha Node v2.1.0 — Bounded Operations Edition

<!-- markdownlint-disable MD013 -->

This release extends the standalone **$AGIALPHA** node with usage-derived opportunity discovery, durable execution reservations, asynchronous independent review, and a local operator interface. It is not the completion of the repository's open-ended AGI vision and does not claim a 10/10 production qualification.

## Changes

- Discover caching candidates directly from fresh structured usage measurements, with explicit economic assumptions and stress-tested admission.
- Reserve daily run/cost capacity before inference; bound pending reviews; prevent concurrent cycles and silent retries after failures; recover committed work without duplicate inference.
- Run a sequential scheduler with backoff, pause controls and a five-failure circuit breaker.
- Inspect identity, reports, reservations and review status through a token-authenticated loopback operator interface. Download evidence and import signed reviews without exposing private keys.
- Import reviewer signatures asynchronously, bound to the exact mission rather than an unrelated global ledger head. Existing v2.0 ledgers remain readable.
- Record immutable reviewer-attested outcomes and compare reported net results with projections.
- Observe pinned escrow state using two HTTPS RPC origins at a shared finalized canonical block, failing closed on disagreement or identity/evidence mismatch.
- Produce deterministic source archives, including the manifest timestamp.

## Validation and boundaries

See `evidence/v2.1.0/validation.md` and the GitHub Actions run associated with the release commit. Tests distinguish deterministic computation, HTTP/RPC fixtures, local Ethereum VM token mechanics, and external capabilities that were not exercised. The operations demonstration explicitly marks its inputs, role-separated reviewer and outcomes as synthetic.

No live model credentials, production ENS-controlled key, funded mainnet escrow, independent human reviewer, Mac host or sustained production workload was available. Accordingly, this release does not establish actual inference quality, mainnet earnings, autonomous production optimization, profitability, a specialist marketplace, self-improvement or reinvestment. Cost reservations are estimates; provider-side spending controls remain necessary.

## Installation and upgrade

Download the source ZIP and `SHA256SUMS.txt`, verify the checksum, extract, and run `npm ci` with Node 22.14+ / npm 10+. Start with `START_HERE.md`, then `docs/alpha-operations.md`.

Stop and back up existing nodes before upgrading. v2.1 reads v2.0 state, but older executables cannot read new event types after v2.1 writes them. Rollback requires the corresponding pre-upgrade state backup. Keep a copy of all newer evidence.
