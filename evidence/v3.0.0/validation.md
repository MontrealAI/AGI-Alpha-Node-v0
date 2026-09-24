# v3.0.0 qualification evidence

<!-- markdownlint-disable MD013 -->

Qualification date: 2026-09-24. Local platform: Linux x64, Node.js 22.14.0. Release publication additionally requires the GitHub Actions jobs on the release commit, including macOS and Docker. Use that immutable commit/run association to inspect remote results.

## Local results

| Check | Evidence |
| --- | --- |
| Clean dependency installation | Plain `npm ci` on the regenerated committed lockfile |
| Backend and integration | 524 passed, 11 legacy environment-dependent skips; includes 81 mandatory standalone tests |
| Frontend | 1 passed; standalone operator DOM and authenticated HTTP checks also run in the backend suite |
| Coverage | V8 statement/line/function/branch thresholds remain 85/85/85/60 percent; see `coverage-summary.json` for measured values and included files |
| Solidity | Lint and compilation; mandatory escrow/manager bytecode execution in an in-process Ethereum VM |
| Subgraph and dashboard | Code generation/build, TypeScript check and Vite dashboard build |
| Security | Root runtime and development dependency audit: zero known advisories at qualification time; machine-readable `dependency-audit.json` |
| Documentation and policy | Markdown/link checks, Grafana JSON validation, health and branch policy checks |
| Recovery | Encrypted backup restoration to a new paused directory, wrong password/tamper rejection, interrupted file-write reconciliation and lost-broadcast recovery |

The 11 skips are inherited: ten Anvil-dependent legacy cases and one environment-dependent ENS case. Mandatory standalone token tests do not depend on Anvil and are not skipped. Coverage is scoped to `src/alpha` (excluding CLI/web), network and telemetry code, not every repository line. CLI/web behavior is separately tested through child processes, HTTP and DOM.

## Connected behavior

`closed-loop/` is produced by the integrated transaction test with `ALPHA_QUALIFICATION_OUTPUT` set. It binds usage-derived planning, a signed specialist result, reviewer acceptance, an actual file change/health check, five signed transactions (submit, review relay, claim, approve, stake), and a reviewer-signed outcome. The local VM pays 100 base units, stakes 40 under the configured cap and retains 60 liquid. Economic values, RPC providers, finality and ENS ownership are fixtures; Solidity execution and cryptographic state transitions are real local computation.

`runtime-demo/` is produced by `npm run demo:runtime -- evidence/v3.0.0/runtime-demo`. It starts an independently keyed specialist in a separate operating-system process and performs real HTTP exchange, a reviewed configuration change and replay. Its usage, outcome and reviewer role are synthetic. No tokens are transferred in that demonstration.

`live-model/` contains actual model output, signed mission evidence, elapsed time, provenance and token usage from `scripts/qualify-local-model.mjs`. The pinned Qwen3-0.6B-Q8_0 GGUF generated a narrative through the same provider path used by operators. The run used 994 prompt and 464 completion tokens. The model reproduced the supplied ranking, recommended the admitted cache experiment and identified assumption/evidence limits. This is an integration check on one synthetic mission, not general model-quality or intelligence certification.

## Failure and authority checks

Tests cover altered signatures and input/evidence bindings; wrong signer/domain/work/expiry and malleable EIP-712 signatures; replay; stale/oversized collector data; unauthorized specialist callers; capacity and quote limits; unsafe file targets; changed owner authorization; external file edits; health-triggered rollback; pause; private intent redaction; wrong backup passwords; pending nonce interference; gas caps; lost broadcast responses; receipt disagreement/substitution; noncanonical blocks; missing token-transfer receipts; liquid reserve and unexpected allowance rejection.

The stricter coverage calculation exposed missing negative paths and a monitor shutdown race. Additional checks qualified those paths without reducing release thresholds. Dependency remediation removed unused Grafana tooling, upgraded Vitest/Vite/Markdown tooling, and pins `solc`'s transitive `tmp` to patched 0.2.7 via a scoped override. The root audit includes development dependencies; it is a point-in-time advisory check, not an independent security audit of source code or contracts.

## Commissioning status

| External fact | Status |
| --- | --- |
| Real local-model inference | Executed; pinned bytes and output archived |
| Actual HTTP specialist and file execution | Executed locally; synthetic mission data |
| Mainnet owner ENS and dedicated signer | Not commissioned; no authorized owner key supplied |
| Production escrow/manager deployment and funding | Not performed; no owner deployment/funding credentials supplied |
| Mainnet payment/staking receipts | Not available; local VM evidence must not be represented as mainnet earnings |
| Independent human/organizational reviewer | Not established by separately keyed test roles |
| Paid-provider billing or sustained workload | Not exercised |
| Target-host unattended service and measured benefit | Owner commissioning remains open |
| General AGI, guaranteed profitability or unlimited scale | Unsupported outcome/research claims |

## Reproduce

```bash
npm ci
npm run ci:verify
npm run typecheck
npm run dashboard:build
npm run test:alpha
npm run demo:runtime
ALPHA_QUALIFICATION_OUTPUT=/absolute/path/closed-loop npx vitest run test/alpha/transactions.test.js
```

Follow the [runtime guide](../../docs/alpha-runtime.md#real-model-qualification) to download the separately licensed pinned model/runtime and reproduce real inference. Run `npm run release:package` from the exact release commit to create the deterministic source ZIP and SHA-256 file. `RELEASE_MANIFEST.json` identifies that commit and hashes each included file. No private node directory, runtime key or model binary belongs in the release archive.
