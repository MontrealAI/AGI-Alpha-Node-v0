# Bounded operations — v2.1 compatibility guide

<!-- markdownlint-disable MD013 -->

For the v3 integrated planner, specialist mesh, reviewed execution and token reinvestment, use [the runtime guide](alpha-runtime.md). This page documents the retained analysis-only `cycle` workflow.

This release extends the standalone **$AGIALPHA** node. It does not depend on AGI Jobs. It delivers a bounded usage-analysis service, not the full sovereign AGI described by the historical manifesto.

## Installation and first operation

Use Node 22.14+ and npm 10+. From the verified release source directory, run `npm ci`. Initialize a node with a separate reviewer as described in [Start here](../START_HERE.md). Never overwrite an existing identity.

Copy `examples/alpha/pipeline.json` into your private node directory as `pipeline.json`. Create `usage.json` alongside it with **your actual measurements** and a current ISO timestamp:

```json
{
  "schema": 1,
  "observedAt": "2026-09-24T12:00:00.000Z",
  "period": "Describe the actual measurement interval",
  "services": [
    { "id": "inference", "name": "Example only", "requests": 1000, "repeatedRequests": 600, "costUsd": 500 }
  ]
}
```

The numbers above are synthetic. Do not update an old observation's timestamp to bypass freshness checks. Your authorized telemetry collector must atomically replace this file with fresh measurements; the node does not automatically connect to cloud billing systems. `source` is a local file resolved relative to `pipeline.json`. A local file is deliberate: there is no arbitrary URL fetcher or model-controlled network access.

Review the assumptions and policy in `pipeline.json`. The default numbers are examples, not recommendations. Run:

```bash
npm run alpha -- cycle
npm run alpha -- operations
npm run alpha -- serve
```

Open the private loopback URL printed by `serve`. Its fragment contains a random session token; do not share it or forward the service through a proxy. The page removes the token from the address bar and keeps it in memory. Reloading requires reopening the original printed URL. The server binds only `127.0.0.1` and checks Host, Origin and API authentication. It serves no private-key endpoint. Local host compromise is outside this boundary.

Use the interface to discover, inspect reports, download evidence, import signed reviews, pause and resume. Configure files and signing environments through the CLI; the interface does not accept private keys. Commands support `--home /absolute/private/node` before the subcommand.

For a disposable fixture demonstration without a funded wallet:

```bash
npm run demo:operations
```

It creates and destroys temporary node/reviewer keys, exercises discovery, replay, review and outcome recording, and exports evidence to `dist/operations-demo`. This is a role-separated software test, not independent human review or actual savings.

## Intelligence and limits

Discovery calculates repeated-request share × observed total cost for each service. That is a savings **ceiling estimate** under uniform request cost and cache eligibility assumptions. The node generates candidates, stress-tests the owner-supplied probability, implementation cost and downside, ranks them, and abstains when policy rejects all candidates. It neither verifies source truth nor makes production changes. Application correctness, privacy, cache eligibility and measured outcomes require review.

Optional model inference is configured as in Start here. It adds a bounded narrative to the deterministic report. It does not create validated forecasts or a self-improving general intelligence. No model was installed or called with live credentials for this release's qualification.

A cycle reserves capacity in the signed ledger **before** inference. Limits apply to the `cycle`/`autopilot` path: maximum daily runs, estimated micro-USD reservations, and pending review capacity. The manual `run` command retains its original behavior and is not governed by pipeline admission limits. Node operators control both paths.

Reservations remain charged after failure. They are estimates, not invoices or a hard external spending cap. Set actual spending controls with the provider. There is no automatic same-cycle retry. Identical mission inputs replay their signed result; changes in measured input or substantive analysis policy create a new mission. Previously attempted failed inputs stay blocked unless the relevant input/configuration changes explicitly. A new day does not retry a failed cycle automatically.

## Unattended operation

```bash
npm run alpha -- autopilot --interval 60
```

The scheduler processes one cycle at a time, backs off after failures, and pauses after five consecutive failures. SIGINT/SIGTERM stop scheduling and allow current bounded work to finish. Another process cannot start a simultaneous pipeline cycle. Keep telemetry collection separately supervised and owner-controlled.

For systemd, use a service running as a dedicated unprivileged account. Set `WorkingDirectory` to the verified release, `ExecStart` to the absolute Node executable followed by `src/alpha/cli.js --home /absolute/private/node autopilot --interval 60`, `UMask=0077`, `Restart=on-failure`, and `RestartSec=30`. Supply secrets through your service manager's protected environment facilities. Do not run as root. On macOS, a launchd agent can run the same absolute executable and argument list. Service-manager installation and Mac operation were not tested in this release; validate them on the intended host before leaving the node unattended.

## Independent review and measured outcomes

Export/download evidence and follow the detached review instructions in Start here. Reviews now survive unrelated ledger activity. Their signatures bind node identity, exact run hash, decision and notes. The node appends its own signed envelope without changing the reviewer's attestation. Duplicate decisions, modified signatures and wrong reviewers are rejected. Distinct addresses do not establish that people are independent.

After acceptance and a separately authorized real-world experiment, the reviewer can prepare `measurement.json`:

```json
{
  "measuredBenefitUsd": 100,
  "measuredCostUsd": 30,
  "observedAt": "2026-09-24T12:00:00.000Z",
  "evidence": "Describe measurement period, baseline, invoices, method and evidence references. Example numbers only."
}
```

Export fresh evidence containing the accepted review. On the reviewer machine:

```bash
npm run alpha -- outcome-sign evidence.json measurement.json --out outcome.json
```

The reviewer key is supplied through `ALPHA_REVIEWER_PRIVATE_KEY`. On the node:

```bash
npm run alpha -- outcome-import outcome.json
npm run alpha -- outcomes
```

Only one signed measurement is accepted per accepted mission. The report compares projected expected net with reviewer-reported net; use equivalent periods and avoid overlapping attribution. This is an immutable audit record, not independently audited profit. The analysis-only `cycle` command does not execute learning or reinvestment. The v3 `operate` command applies explicitly configured adaptive and transaction policies.

## Finalized settlement observation

Funding and wallet submission remain the explicit procedures in Start here. The new read-only command requires `ALPHA_RPC_URL` and `ALPHA_SECOND_RPC_URL`, using distinct HTTPS origins, and a hash of independently verified deployed escrow bytecode:

```bash
npm run alpha -- settlement-observe MISSION_ID --escrow 0xDEPLOYED_ESCROW --code-hash 0xVERIFIED_RUNTIME_CODE_HASH
```

Both endpoints must agree on chain 1, a common finalized canonical block, pinned bytecode, canonical token and the mission state. Node/reviewer addresses, reward and evidence binding are checked. RPCs must support EIP-1898 block-hash selectors for code and calls; unsupported endpoints fail closed. Different origins do not prove independent RPC operators. A returned `paid` state is an observation of pinned escrow storage, not independent transfer-receipt verification. The command signs no transactions, never spends funds and does not alter the local reward field. No production escrow or mainnet payment was verified during release qualification.

## Recovery, upgrades and rollback

1. Pause the node. Stop scheduler and interface processes. Confirm the recorded PIDs no longer run before removing stale `writer.lock` or `pipeline.lock`. Never delete a lock held by a live process.
2. Back up the **whole** private directory while stopped, with encryption and restrictive permissions. It includes the key, configuration, signed ledger, pause marker and deliverables. Do not commit backups to git.
3. Run `status` and `operations`. Integrity failure requires restoring a consistent backup; never edit signed ledger events. A stale `state.json.PID.tmp` file is an uncommitted write; retain it for investigation, then remove it only while stopped. The authoritative state is `state.json` after integrity verification.
4. If the result was committed before a crash, resume and rerun the same cycle: it exports the existing result and closes an unresolved reservation without another inference request.
5. If a reservation has no committed result, remain paused and use `recover-reservation CYCLE_HASH`. This records failure and retains the reservation. It does not retry the attempted cycle or erase possible provider charges. Inspect the provider account and obtain fresh evidence or explicitly revise configuration before new work.
6. Extract upgrades into a new code directory, verify the archive checksum and manifest, install with `npm ci`, and run the upgraded CLI against a **copy** of the stopped private directory first. Verify status, review and export before changing the service path.
7. v2.1 can read v2.0 ledgers. Once v2.1 writes operation/review-envelope/outcome events, v2.0 cannot read the expanded event vocabulary. To roll back, stop v2.1 and restore both the previous code and the matching pre-upgrade directory backup. Preserve the newer directory separately for audit; do not silently discard work.

The ledger has a 32 MiB bound and fails closed at capacity. Archive a stopped verified node and start a new directory before reaching it; history is not silently pruned. A local owner with the signing key can rewrite signed history, so retain external copies of accepted evidence when stronger audit guarantees are required.
