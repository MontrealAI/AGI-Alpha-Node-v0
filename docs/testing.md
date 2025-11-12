# Testing & Validation Guide

AGI Alpha Node v0 ships with a multi-layered test matrix that spans smart
contracts, the Node.js runtime, CI guardrail scripts, and end-to-end telemetry
validation. Use this guide to run the appropriate checks locally, understand
their output, and triage failures quickly.

## Test Matrix Overview

* **TypeScript unit + integration** — Validates services, health gates,
  governance logic, and CLI orchestration via `npm test`.
* **Solidity contract verification** — Compiles and exercises
  `AlphaNodeManager` against Anvil with
  `npx vitest run test/alphaNodeManager.contract.test.js`.
* **Script smoke tests** — Confirms manifest rendering plus ENS gate enforcement
  using `npx vitest run test/scripts.*.test.js`.
* **Governance & ENS smoke** — Ensures owner directives and health gating work
  together via `npx vitest run test/ownerControls.smoke.test.js`.
* **E2E subgraph simulation** — Deploys contracts, emits events, and validates
  indexed metrics through `npm run simulate:subgraph`.
* **Full CI parity** — Mirrors `.github/workflows/ci.yml` locally with
  `npm run ci:verify`.

## Running the Suites

### 1. TypeScript unit + integration tests

```bash
npm test
```

*Covers:* services under `src/services`, orchestration utilities, telemetry
registries, and the ENS gating smoke tests. The run uses Vitest in batch mode;
use `npm run test:watch` while iterating locally.

### 2. Solidity contract tests

```bash
anvil --port 8550 &
ANVIL_PID=$!
npx vitest run test/alphaNodeManager.contract.test.js
kill $ANVIL_PID
```

*Requirements:* Foundry's `anvil` binary plus the `solc` npm package (already in
`devDependencies`). These tests now assert identity helpers, pause controls,
validator gating, and ENS ownership invariants.

### 3. Script smoke tests

```bash
npx vitest run test/scripts.*.test.js
```

Validates the `render-subgraph-manifest`, `verify-branch-gate`, and
`verify-health-gate` scripts. Failures usually mean CI guardrails (ENS
allowlists, manifest templating) will reject deployments.

### 4. Owner control & ENS gating smoke

```bash
npx vitest run test/ownerControls.smoke.test.js
```

Executes a high-level scenario where `deriveOwnerDirectives` issues
pause/top-up actions, the health gate toggles authority, and
`createJobLifecycle` suppresses Alpha events whenever ENS gating is unhealthy.

### 5. End-to-end subgraph simulation

```bash
npm run simulate:subgraph
```

Deploys `AlphaNodeManager` to a live RPC, streams lifecycle events, and waits
for the subgraph to emit KPI windows. Requires access to a JSON-RPC endpoint
plus a running Graph Node.

### 6. Full CI verification

```bash
npm run ci:verify
```

Runs markdown linting, Vitest, coverage, Solidity lint+build, subgraph
generation, security audit, and ENS gate checks exactly as CI will.

## Interpreting Output & Triaging Failures

### Vitest suites

* **Green check ✅** — All tests passed; look for `Test Files  Passed` summary.
* **Failure patterns** — Files listed under `Failures:` indicate assertion or
  runtime issues. Re-run a single file via `npx vitest run path/to/test.js` for
  rapid iteration.
* **Suppressed emissions** — ENS gate tests increment
  `metrics.alphaGate.suppressed`; a non-zero value confirms the gate is working.
  Investigate health gate configuration if this unexpectedly rises.

### Solidity + Anvil

* **Compilation errors** — Usually emitted before tests run. Inspect the solc
  message for syntax regressions. Run `npm run lint:sol` for lint hints.
* **RPC connectivity** — If `JsonRpcProvider` cannot connect, ensure `anvil` is
  live on `8550` and retry.
* **Event assertions** — Logs failing to parse mean ABI drift. Recompile
  artifacts or update tests after contract changes.

### Script smoke tests

* **Manifest rendering** — Output mismatches usually come from unexpanded
  placeholders. Ensure env vars `ALPHA_NODE_MANAGER_ADDRESS` and `START_BLOCK`
  are set or rely on defaults.
* **Branch gate failures** — Message `ENS handle ... is not allowlisted`
  identifies the ENS extracted from the branch. Update `HEALTH_GATE_ALLOWLIST`
  or rename the branch to an allowlisted handle.
* **Health gate failures** — Look for `missing required ENS patterns` or
  `not permitted` errors. Align `HEALTH_GATE_ALLOWLIST`, `NODE_LABEL`, and
  `HEALTH_GATE_OVERRIDE_ENS` accordingly.

### Subgraph simulation

* **Timeouts** — If the script times out waiting for metric windows, check the
  Graph Node logs and ensure it indexed the deployment. Increase `RPC_URL`
  stability and confirm events emitted successfully.
* **Assertion mismatches** — Indicates metrics diverge from emitted events.
  Inspect subgraph mappings and compare on-chain event payloads.

### CI Verification

* `ci:policy` — Runs ENS gate scripts; failures block protected branches.
  Update allowlists or branch naming before retrying.
* `ci:solidity` — Enforces lint + compilation; fix contract warnings before
  merge.
* `ci:coverage` — Produces `coverage/coverage-final.json` and `lcov` output;
  verify deltas when adjusting test plans.

With this guide, you can decide which layer to run, decode the resulting output
quickly, and zero in on remediation steps before CI is triggered.
