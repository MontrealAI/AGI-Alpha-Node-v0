# Integrated $AGIALPHA runtime

<!-- markdownlint-disable MD013 -->

This guide describes v3.1.0. Begin with [START HERE](../START_HERE.md). All examples with placeholder addresses, paths or hashes require owner configuration; no transaction policy is enabled by default.

## The operating loop

`operate` reconciles accepted runtime missions, applies their reviewed action, and advances any enabled settlement by one durable step. It then collects observations, builds a task-scoped model, stress-tests candidates, reserves capacity, obtains configured specialist results and signs a report for review. `autopilot --runtime` repeats this process. `cycle` retains the v2 analysis-only behavior.

`pipeline.json` defines the observation file, freshness, economic assumptions, risk limits, pending-review capacity and daily cost reservations. `engine.json` adds the planner, peers, actions and optional transaction policy. Start with `examples/alpha/engine.json`. Unknown configuration fields are rejected.

The observation schema is deliberately specific: service request counts, repeated requests, service costs, observation timestamp and period. Candidates estimate cache savings from the repeated-request cost share. Broader market discovery and causal cost attribution require additional research and validated adapters; they are not inferred from this calculation.

## Observe, adapt and abstain

An optional `collector` object in `engine.json` can fetch an authorized JSON usage document:

```json
{ "collector": { "url": "https://your-authorized-service.example/alpha-usage" } }
```

The endpoint must return the usage schema within 15 seconds and 100 KB. HTTPS or explicit loopback HTTP is required; redirects and credentials/query/fragment in URLs are rejected. An authenticated upstream should be exposed through your own protected local collector. The runtime validates freshness before atomically updating the pipeline source.

The adaptive model groups accepted reviewer-signed observed paired outcomes by recommendation ID and identical signed measurement contract, uses a bounded rolling window and a weighted prior, and only reduces probability/benefit estimates. Legacy, modeled, fixture, overlapping and duplicate-artifact observations cannot drive adaptation. It never changes owner spending or action permissions. At the configured consecutive-loss threshold it abstains. Use comparable observation periods, workloads and attribution methods; signed measurements are not causal proof. A cached plan for an existing observation remains unchanged while waiting for review. Fresh observations produce a new plan.

After measuring an accepted mission, export its latest bundle. On the reviewer machine:

```bash
npm run alpha -- outcome-sign evidence.json measurement.json --out outcome.json
```

That simple legacy measurement format remains readable but no longer drives learning. New measured outcomes use the signed paired-value contract, explicit evidence class, equal workload/period, full cost categories and artifact hashes described in [measurement and qualification](alpha-qualification.md). On the node, import it with `outcome-import outcome.json`. One outcome per mission is accepted; preserve corrections separately and use a new mission rather than editing signed history.

## Authenticated specialists

Initialize a separate node directory and put this owner-edited `specialist.json` inside it:

```json
{
  "allowedCallers": ["0xAUTHORIZED_COORDINATOR_ADDRESS"],
  "capabilities": ["evidence-analysis", "risk-review", "implementation-plan"],
  "priceMicroUsd": 0,
  "maxDailyRequests": 100
}
```

Start it with `alpha-node --home /private/specialist specialist --port 8088`. It binds loopback; remote service requires an owner-managed HTTPS reverse proxy and host access controls. Configure the coordinator with `peers: [{"address":"0xSPECIALIST_ADDRESS","url":"https://your-specialist.example"}]`, the required `specialistCapabilities`, and `maxSpecialistPriceMicroUsd` in `engine.json`.

The coordinator selects the cheapest authenticated capability within the price ceiling. Request and result signatures bind both parties, mission digest, capability and request ID. The server persists reservations and results; replay returns the same result. The coordinator independently recomputes these deterministic capabilities. An unreachable, wrongly signed, substituted or over-budget result cannot become a successful mission.

Quotes are selection/accounting metadata; there is no implicit peer charge or permissionless marketplace. If a specialist is to be paid, fund a separate reviewed escrow mission explicitly. Configured peer addresses are trust anchors, not independently verified ENS ownership of those peers.

## Exact reviewed actions

The implemented external capability is `json-set`: replace one existing scalar property in a small JSON configuration file. The target service must actually consume this configuration and expose an adequate health endpoint. There is no arbitrary shell or model-generated code execution.

Add an action under the recommendation ID, for example:

```json
{
  "actions": {
    "cache-inference": {
      "kind": "json-set",
      "root": "/absolute/owner-managed/service",
      "file": "settings.json",
      "pointer": ["cacheEnabled"],
      "value": true,
      "healthUrl": "http://127.0.0.1:8080/health",
      "healthField": "healthy",
      "healthValue": true,
      "timeoutMs": 5000
    }
  },
  "maxDailyActions": 1
}
```

The planner binds the exact target, action, file mode and before/after hashes into the signed report. Execution requires accepted review, unchanged owner authorization, an unchanged target and an unpaused node. Symlinks, hard links, path escape, prototype keys, new properties and scalar type changes are rejected. A backup is synchronized before the intent record; target writes and journal updates are synchronized separately so interruption can be reconciled.

A failed health check restores the original bytes and pauses the node. External edits cause refusal to overwrite. An already active configuration causes abstention on a new observation. Use an exclusively managed configuration directory: non-cooperating writers or a compromised host can defeat filesystem preconditions between checks. Health verifies the configured predicate, not business benefit; measure outcomes separately.

## Live identity and token execution

Create a new live node using the actual ENS-controlled dedicated signer. Set `ALPHA_NODE_PRIVATE_KEY` and `ALPHA_RPC_URL` securely, then:

```bash
npm run alpha -- --home /absolute/private/live-node init --live --ens yourname.alpha.node.agi.eth --reviewer 0xREVIEWER_ADDRESS
npm run alpha -- --home /absolute/private/live-node doctor
```

Copy and configure `pipeline.json` and `engine.json` into that directory. Live checks require Ethereum chain ID 1, ENS address resolution matching the signer, and 18 decimals at canonical $AGIALPHA `0xa61a3b3a130a9c20768eebf97e21515a6046a1fa`. Identity is checked before live work and settlement; the ENS check uses the configured identity RPC, not a claim of decentralized consensus.

Deploy and independently verify `AlphaMissionEscrow.sol` and, if staking is desired, `AlphaNodeManager.sol`. The owner must register/activate the actual identity in the manager. Bytecode pinning alone does not identify an implementation upgrade behind a proxy; the owner verification must account for any proxy/delegatecall dependency. Existing deployments do not acquire v3 logic automatically. Independently establish keccak256 hashes of deployed runtime bytecode and compare verified source/build inputs; do not blindly trust a hash supplied by one endpoint.

Through the owner wallet, approve the exact reward and call escrow `fund(workId,nodeAddress,reviewerAddress,rewardBaseUnits,deadlineUnixSeconds)`. Use the work ID printed by the node. The designated reviewer and node must differ. Funds come from the owner; the escrow does not mint tokens.

Add `transactions` to `engine.json` using independently verified addresses/hashes:

```json
{
  "enabled": true,
  "escrow": { "address": "0xDEPLOYED_ESCROW", "codeHash": "0xVERIFIED_RUNTIME_HASH" },
  "tokenCodeHash": "0xVERIFIED_CANONICAL_TOKEN_RUNTIME_HASH",
  "manager": { "address": "0xDEPLOYED_MANAGER", "codeHash": "0xVERIFIED_MANAGER_RUNTIME_HASH" },
  "maxGasLimit": "500000",
  "maxFeePerGasWei": "30000000000",
  "priorityFeePerGasWei": "1000000000",
  "maxDailyGasWei": "50000000000000000",
  "reinvestBps": 2000,
  "maxReinvestPerMission": "1000000000000000000",
  "minLiquidBalance": "1000000000000000000"
}
```

These are illustrative limits, not recommendations about network prices or investment. Values ending in `Wei` are native ETH base units; token amounts use 18-decimal base units. With `reinvestBps: 0`, omit the manager and retain the full reward. Configure two independently operated HTTPS origins in `ALPHA_RPC_URL` and `ALPHA_SECOND_RPC_URL`. Distinct origins are enforced; independent operation must be verified by the owner. Never use the node transaction signer concurrently in another wallet or application.

To allow the node to relay acceptance, the reviewer adds `--escrow 0xDEPLOYED_ESCROW --expires-at UNIX_SECONDS` to `review-sign`. This signs a domain-bound EIP-712 authorization for the exact work/evidence hash and deadline. The node cannot change the recipient or approve its own work. Alternatively, the reviewer calls the contract's direct `review` function and the node waits for that state.

`settle MISSION_ID` or `operate` progresses through submit, review relay, claim, exact allowance and stake. Each step records the signed transaction before broadcasting. Repeated calls reconcile the same hash and nonce, wait for matching finalized receipts and verify canonical block/bytecode/state. Claim verification requires both the escrow payment event and canonical-token transfer. Reinvestment uses only this executor's verified claim receipt, stays below the percentage/absolute cap, and preserves the liquid reserve. Gas reservations use maximum fees and remain conservative across unresolved transactions and day boundaries.

Pausing stops new local broadcasts; an already broadcast transaction may still mine. Contract admission pause preserves valid claims/refunds. Accepted rewards remain payable after the mission deadline; rejected or expired unaccepted work refunds its original funder. Mainnet commissioning evidence is **not supplied by this release**; complete the owner deployment record before enabling funds.

## Services and containers

Generate a configuration file, review its paths and provide secrets through a protected service environment:

```bash
npm run alpha -- --home /absolute/private/node service-config macos --out org.agialpha.node.plist
npm run alpha -- --home /absolute/private/node service-config linux --out agialpha-node.service
```

For macOS, put the reviewed plist in `~/Library/LaunchAgents/`, validate with `plutil -lint`, then use `launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/org.agialpha.node.plist`. Stop with `launchctl bootout` using the same domain/path. For Linux, put the unit in `~/.config/systemd/user/`, run `systemctl --user daemon-reload`, then `systemctl --user enable --now agialpha-node`. Review logs and arrange log rotation. A generated service is not installed automatically.

The default Docker image runs the standalone worker as the `node` user with `/data` as its persistent volume. Initialize/configure that volume first and give it the correct ownership. `docker run --rm IMAGE --help` shows commands. The operator interface binds loopback inside the container, so ordinary port publishing alone does not expose it; use the native host interface or an explicitly designed secure local proxy. The former infrastructure image is retained at `deploy/docker/Dockerfile.legacy`.

## Real-model qualification

The release includes an actual inference run through the normal provider path using Qwen3-0.6B-Q8_0 and llama.cpp. Model source: [Qwen3-0.6B-GGUF](https://huggingface.co/Qwen/Qwen3-0.6B-GGUF), revision `23749fefcc72300e3a2ad315e1317431b06b590a`, Apache-2.0. GGUF SHA-256: `9465e63a22add5354d9bb4b99e90117043c7124007664907259bd16d043bb031`. The model is downloaded separately and is not bundled.

The tested Linux runtime is [llama.cpp b11146](https://github.com/ggml-org/llama.cpp/releases/tag/b11146); its `llama-b11146-bin-ubuntu-x64.tar.gz` SHA-256 is `c150306eb16b5ab696f76a8bdf810c35fd98a24e82158742e6fa28f420ff8410`. Use a compatible platform build on other systems; that is a separate qualification.

```bash
node scripts/qualify-local-model.mjs --server /path/to/llama-server --model /path/to/Qwen3-0.6B-Q8_0.gguf --model-sha256 9465e63a22add5354d9bb4b99e90117043c7124007664907259bd16d043bb031 --revision 23749fefcc72300e3a2ad315e1317431b06b590a --runtime 'llama.cpp b11146' --out model-evidence
```

The script verifies model bytes, starts an authenticated loopback server, runs a normal signed mission and exports model provenance/usage. A single useful narrative confirms integration, not general intelligence or broad model quality. Its economic assumptions are synthetic.

## Commissioning record

Before a funded deployment, retain the owner/ENS identity verification, dedicated signer policy, independently verified deployed bytecode, funding and reviewer addresses, RPC operator identities, actual provider spending limits, authorized service target and health semantics, backup/restore drill, and first finalized payment/stake receipts. Observe comparable real outcomes over a defined operating period before expanding budgets. None of these owner-specific facts should be substituted with demo results.

## General mission intelligence and qualification

The [intelligence guide](alpha-intelligence.md) configures arbitrary mission evidence, research and adversarial model specialists. The [qualification guide](alpha-qualification.md) covers comparable measurements, external signed assessments, fresh claim auditing and admission controls. `requireQualifiedAdmission` defaults to false for explicit commissioning; an enabled gate blocks new missions while preserving reconciliation of existing accepted obligations.
