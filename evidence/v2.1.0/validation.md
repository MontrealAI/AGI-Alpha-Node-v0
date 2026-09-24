# v2.1.0 qualification evidence

<!-- markdownlint-disable MD013 -->

Status: local qualification passed on Linux x64, Node 22.14.0 / npm 10.9.2. The release workflow repeats gated checks on the published commit.

- Final backend run: **484 passed, 11 skipped**; standalone alpha subset: **47 passed**.
- Legacy frontend: **1 passed**.
- Full aggregate CI verification, TypeScript typecheck, legacy dashboard build, subgraph build, Solidity lint/compile and health policy: passed. The aggregate run preceded the final additional CLI test; the subsequent full backend coverage run included it.
- Production audit: **0 vulnerabilities**.
- Coverage scope: standalone alpha core, network and telemetry; **87.99% lines/statements, 91.77% functions, 67.97% branches**. CLI child-process and DOM UI tests are outside instrumentation.
- Local branch check skipped because its branch environment was absent; repository branch-protection enforcement remains unverified.

See `validation.json`, `ci-verify.txt`, `coverage-run.txt`, `coverage-summary.json`, `typecheck.txt` and `dashboard-build.txt` for recorded results. Expected error-path fixture logs are not production incidents.

The operations demonstration in `sample/` uses synthetic usage and outcome values, ephemeral node/reviewer keys controlled by the test harness, and no live model or mainnet transaction. `demo.txt` records its execution.

New tests cover usage-derived discovery, freshness and consistency checks, replay, daily reservation and review admission limits, lock/pause controls, failure retention, interrupted-cycle recovery, asynchronous reviews, outcome signatures, authenticated loopback HTTP controls, safe DOM rendering and finalized RPC state agreement. RPC fixtures are not mainnet observations. The retained contract tests execute bytecode and token state changes in a local Ethereum VM.

Live commissioning remains unperformed: production model quality, ENS-controlled signing, mainnet escrow and payment receipts, independent human judgment, Mac service installation, sustained uptime and realized profitability. The broader specialist marketplace, general world model, automatic production optimization, self-improvement and reinvestment vision is not implemented by this release.
