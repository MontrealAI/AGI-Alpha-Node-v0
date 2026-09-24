# Start here — AGI Alpha Node v2.0.0

<!-- markdownlint-disable MD013 -->

## 1. Install and produce your first deliverable

Use Node.js 22.14+ and npm 10+. Download the release source ZIP, extract it, and open a terminal in the extracted directory. On a Mac, the native SQLite dependency normally uses a prebuilt binary; if compilation is necessary, install Apple's Command Line Tools with `xcode-select --install`.

```bash
npm ci
npm run alpha -- init --ens demo.alpha.node.agi.eth
npm run alpha -- run examples/alpha/opportunity-scan.json
npm run alpha -- export alpha-opportunity-001 --out alpha-output
```

Read `alpha-output/report.md` and retain `alpha-output/evidence.json`. The example is synthetic and uses no paid provider, wallet funds, or mainnet transactions. For your own mission, copy the example, change its ID, replace the source texts with authorized evidence, and provide explicit benefit/cost/probability/downside assumptions. The node computes rankings; it does not independently establish those assumptions.

## 2. Set up review from the beginning

Create a new node with the address of a separate reviewer:

```bash
npm run alpha -- --home .alpha-node init --ens yourname.alpha.node.agi.eth --reviewer 0xREVIEWER_ADDRESS
```

Do not rerun initialization over an existing node. If you started the demonstration first, keep it separate and use a different private directory. A reviewer address is not required for analysis, but approval and settlement require it.

After a run, export the evidence. Give **only the exported bundle** to the reviewer. The reviewer independently examines the underlying source material and recalculates or challenges the recommendation. On the reviewer's machine, set `ALPHA_REVIEWER_PRIVATE_KEY` through a secure environment or secret manager, then run:

```bash
npm run alpha -- review-sign evidence.json --decision accepted --notes "Describe the checks and limitations" --out review.json
```

Use `rejected` when evidence or quality is insufficient. On the node machine:

```bash
npm run alpha -- review-import review.json
npm run alpha -- status
```

A detached review is bound to the exported ledger head. If the node has processed more work since export, export the current evidence again and obtain a fresh signature. This prevents silent rebinding. Pause the node during review if you need a stable ledger head. The `review` command is also available in a controlled reviewer environment, but the detached path avoids sharing the node's key.

## 3. Optional actual model inference

By default, analysis is local deterministic computation. It is not an LLM. To add a model, stop the worker and edit the `provider` field in your private `config.json`:

```json
{
  "url": "http://127.0.0.1:1234/v1/chat/completions",
  "model": "YOUR_INSTALLED_MODEL_ID",
  "maxTokens": 2048
}
```

The endpoint must implement the chat-completions JSON protocol. A remote endpoint must use HTTPS; add `"keyEnv": "ALPHA_MODEL_API_KEY"` and provide that variable securely when authentication is needed. Do not put API keys in URLs or commit private config. Configuring a remote provider sends the mission's source text and assumptions to that provider. Choose evidence you are authorized to transmit.

Inference has a 60-second request timeout, a 1 MB response limit, an explicit output token cap and no automatic retries. Provider failure fails the mission instead of substituting a simulated success. A crashed run may already have incurred provider cost: recovery cannot guarantee exactly-once external billing. Provider usage is recorded when returned; a token cap is not a monetary budget. Set spending limits with your provider.

## 4. Live ENS identity

Set `ALPHA_RPC_URL` and `ALPHA_NODE_PRIVATE_KEY` in a secure environment. Use the key whose address is published as the Ethereum address record of your direct `*.alpha.node.agi.eth` subname. Initialize a new live directory:

```bash
npm run alpha -- --home /absolute/private/live-node init --live --ens yourname.alpha.node.agi.eth --reviewer 0xREVIEWER_ADDRESS
npm run alpha -- --home /absolute/private/live-node doctor
```

The node requires chain ID 1, matching ENS resolution, code at the canonical $AGIALPHA address, and 18 token decimals. It repeats these checks before new work. Live checks observe the RPC's current state; this release does not establish independent multi-RPC consensus or monitor finalized ENS changes continuously.

An ENS address match demonstrates authorized address routing, not exclusive legal ownership. The signing key is stored locally with restrictive file permissions; disk encryption, host access control and encrypted backups remain necessary.

## 5. Fund and settle a mission

Deploy and verify `contracts/AlphaMissionEscrow.sol` with the owner wallet after reviewing the contract and testing your deployment procedure. This release does not provide a production deployment address or perform mainnet transactions.

The token is `0xa61a3b3a130a9c20768eebf97e21515a6046a1fa`, with 18 decimals. Through a wallet or your contract tooling:

1. Approve the escrow to transfer the exact reward amount from the owner.
2. Call `fund(workId, nodeAddress, reviewerAddress, rewardBaseUnits, deadlineUnixSeconds)`. The CLI prints the work ID when a run completes. Set a deadline covering both submission and review.
3. Obtain a signed accepted review of the exact exported evidence.
4. Generate transaction payloads:

   ```bash
   npm run alpha -- settlement-plan alpha-opportunity-001 --treasury 0xDEPLOYED_ESCROW
   ```

5. Check chain, deployed bytecode, funding, addresses, evidence hash and deadline. Submit the node's `submit` transaction, the reviewer's `review` transaction, and the `claim` transaction using their respective wallets. Wait for and inspect each receipt before proceeding.

The plan is **unsigned and unsent**, and does not assert that the named escrow is deployed or funded. The local ledger does not mark payment from a plan. Actual payment evidence is the canonical token transfer and escrow receipt on-chain. The funder's designated reviewer is trusted to judge quality; different addresses do not prove reviewers are independent people.

## 6. Run continuously

Place authorized mission JSON files in a dedicated directory, then run:

```bash
npm run alpha -- watch ./my-mission-inbox
```

The worker processes them sequentially. It reuses completed identical missions and reports conflicts or errors. Use `pause`, `resume` and `status` from a second terminal; use Ctrl+C to stop the worker. No external actions or transactions are executed automatically.

A signed work record is evidence of an analytical output, not proof of financial alpha. Assess usefulness with real operator inputs and independently reviewed outcomes before widening the mission scope.
