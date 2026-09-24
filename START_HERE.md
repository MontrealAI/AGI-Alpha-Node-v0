# Start here — AGI Alpha Node v3.0.0

<!-- markdownlint-disable MD013 -->

## 1. Install and see the whole local workflow

Use Node.js 22.14+ and npm 10+. Download and extract the release ZIP, verify it against `SHA256SUMS.txt`, and open a terminal in the extracted directory. On macOS, if a native dependency requires compilation, install Apple's Command Line Tools with `xcode-select --install`.

```bash
npm ci
npm run demo:runtime
```

Read `alpha-runtime-output/report.md` and `runtime.json`. This runs the actual planner, a separate specialist process, signed review, a file change, health verification and outcome recording. Its economic values and reviewer role are synthetic. Token execution is qualified separately by mandatory local EVM tests; nothing here spends money.

For a single supplied mission without the runtime, use `npm run demo:alpha`.

## 2. Configure your own node

Prepare an authorized usage JSON file in the format of `examples/alpha/usage.json`. Its timestamp must describe a real observation, its period must be explicit, and service costs/repeated requests must come from your measurement process. Do not relabel example data as measurements.

Choose a separate reviewer address, then initialize a new private directory:

```bash
npm run alpha -- --home /absolute/private/node setup --ens yourname.alpha.node.agi.eth --reviewer 0xREVIEWER_ADDRESS --usage /absolute/path/usage.json
```

Replace placeholders before running. `setup` validates the input format, generates a local signer, and writes `pipeline.json` and `engine.json`. It does not enable transactions or external changes. Local ENS names are unverified labels. Never fund demonstration keys.

Review the pipeline's cost, probability, downside, freshness and daily limits. These are owner assumptions, not established forecasts. The [runtime guide](docs/alpha-runtime.md) explains peers, collectors, authorized actions, learning and live token policy.

```bash
npm run alpha -- --home /absolute/private/node operate
npm run alpha -- --home /absolute/private/node serve
```

Open the private URL printed by `serve`. It shows missions, evidence, reservations, runtime activity, outcomes and pause controls. Keep the URL secret. The interface binds loopback and does not reveal signing keys or raw transactions.

## 3. Obtain independent review

Export the mission ID reported by `operate`:

```bash
npm run alpha -- --home /absolute/private/node export MISSION_ID --out /absolute/path/review-bundle
```

Give only `report.md` and `evidence.json` to the designated reviewer. The report includes the exact proposed action, before/after hashes, target and health check. Acceptance authorizes that specific action. The reviewer should challenge source truth, assumptions, target ownership and health-check adequacy.

On the reviewer's machine, supply `ALPHA_REVIEWER_PRIVATE_KEY` through a protected environment, then run:

```bash
npm run alpha -- review-sign evidence.json --decision accepted --notes "Checks performed and remaining limitations" --out review.json
```

Use `rejected` when appropriate. On the node machine:

```bash
npm run alpha -- --home /absolute/private/node review-import review.json
npm run alpha -- --home /absolute/private/node operate
```

Unrelated ledger activity does not invalidate a v3 detached review. Separate addresses do not prove separate people. The reviewer key belongs on the reviewer machine.

## 4. Add actual model inference

Stop workers and edit the `provider` field in the private `config.json`:

```json
{
  "url": "http://127.0.0.1:1234/v1/chat/completions",
  "model": "YOUR_INSTALLED_MODEL_ID",
  "maxTokens": 2048
}
```

Use a chat-completions compatible endpoint. Remote endpoints require HTTPS. Add `"keyEnv": "ALPHA_MODEL_API_KEY"` when authentication is needed and provide that variable securely. Mission sources are transmitted to the configured provider. Model prose is unverified analysis and has no execution authority.

Requests have a 60-second timeout, 1 MB response limit, output-token cap and no automatic inference retry. Failure does not become simulated success. Set provider-side monetary limits as well: tokens and local reservations cannot guarantee external billing. The [model qualification procedure](docs/alpha-runtime.md#real-model-qualification) reproduces this release's local Qwen/llama.cpp run.

## 5. Operate continuously and protect recovery

```bash
npm run alpha -- --home /absolute/private/node autopilot --runtime --interval 60
npm run alpha -- --home /absolute/private/node pause
```

Run the worker in one terminal and controls in another. It waits for review, applies authorized actions, reconciles enabled settlement, then considers fresh observations. Five consecutive errors pause it. Stop with Ctrl+C before maintenance.

Follow [backup and recovery](docs/alpha-recovery.md). Generate a reviewed Linux or macOS service configuration with `service-config`. Live ENS, funded settlement and capped reinvestment are configured explicitly in the [runtime guide](docs/alpha-runtime.md#live-identity-and-token-execution).
