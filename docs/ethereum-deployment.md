# Ethereum contract deployment and verification

<!-- markdownlint-disable MD013 -->

**This is the advanced operator path. [New users start here](getting-started.md).** Installing the node or running a local rehearsal never deploys to Ethereum. v3.3.0 supplies deployment tooling; it does not supply a mainnet deployment, independent audit, owner-control proof or funded commissioning record.

## Scope and custody

The standalone runtime uses `AlphaMissionEscrow` and optionally `AlphaNodeManager` for staking. This deployment plan installs both. Both are non-upgradeable and bind the canonical $AGIALPHA token at `0xA61a3B3a130a9c20768EEBF97E21515A6046a1fA`. The token address in source is not, by itself, evidence of token code or issuer trust. Independently verify the runtime code and token behavior before entering its hash.

The manager is owner-administered custody: users cannot assume permissionless withdrawal. Its owner can move stake using the explicit account-debited custody function. The escrow owner funds missions and chooses the node and reviewer; accepted claims remain payable when paused. `Ownable` uses an **immediate, one-step ownership transfer** and permits renunciation. Verify the destination owner or multisig and its ability to execute calls before transfer. Do not renounce ownership. The temporary deployer is required to differ from the final owner.

`TreasuryExecutor` is retained legacy infrastructure with broad owner/orchestrator authority. It is compiled, but is deliberately outside this standalone deployment plan. Its use needs a separately reviewed treasury design. No script automatically upgrades old contracts, migrates custody, sweeps funds, registers identities, enables payments or unpauses deployment.

## 1. Build and rehearse locally

Use a clean checkout of the release and Node.js 22.14+ with npm 10+. Install exactly from the lockfile:

```bash
npm ci
npm run contracts:build
npm run deploy:rehearse
npm run test:onboarding
npm run test:alpha
```

Hardhat 3.19.0 uses the locally pinned solc 0.8.37 compiler, optimizer 200 runs and Paris EVM target. It does not download an unpinned compiler at build time. `build/hardhat/artifacts/build-info/` contains exact compiler inputs and outputs. Deployment artifacts are checked against source files and compiler settings. The rehearsal deploys optimized artifacts on an in-process chain 31337, checks bytecode (including immutable token handling), token binding, unauthorized access, pause, ownership handover and rejection of the old owner. It saves `build/deployment/local-rehearsal.json`.

The separate mandatory Alpha tests exercise funded token lifecycles in a local EVM. Local tests do not verify mainnet balances, external reviewers or real economics. Run a pinned mainnet-fork rehearsal and independent source/security review in your deployment environment before using funds.

## 2. Prepare a read-only mainnet plan

Copy `deploy/mainnet.example.json` into a private directory and replace every placeholder. Set:

| Field | Required evidence |
| --- | --- |
| `chainId` | Exactly `1` (Ethereum mainnet) |
| `deployer` | Dedicated EOA with a backed-up encrypted keystore, ETH for gas and no unrelated pending transactions |
| `owner` | Separately verified controller or multisig; check address, owners, threshold and successful control exercise |
| `tokenCodeHash` | Independently established keccak256 of canonical token runtime code, checked against verified source and any proxy dependencies |
| `nonce` | Exact next pending nonce of the dedicated deployer |
| Fee limits | Explicit maximum EIP-1559 fee, priority fee and total ETH exposure |
| `validUntil` | ISO UTC expiry within 24 hours; allow sufficient time for review and six sequential confirmation waits |

Provide `ALPHA_RPC_URL` and `ALPHA_RPC_URL_SECONDARY` securely in your local environment. They must be HTTPS endpoints with different origins operated by independent providers. Different hostnames alone do not establish organizational independence. Do not paste credentials into public logs or issues.

```bash
npm run deploy:plan -- /private/deploy-config.json /private/deployment-plan.json
```

This command is read-only. It checks both chain IDs, a shared recent finalized block, canonical token code and decimals, pending nonce, and sufficient ETH for the entire bounded plan. It refuses to overwrite a plan. The output includes predicted addresses, constructor arguments, six exact transactions, source digest, expiry, maximum cost and a SHA-256 plan hash. Fee caps are upper bounds, not a promise of inclusion or a market quote.

Review the plan and build inputs independently. Verify all addresses through a trusted channel. The order is escrow deployment → pause → ownership transfer, followed by manager deployment → pause → ownership transfer. The contracts must remain unfunded throughout commissioning. Owner-only actions and unregistered identity state limit the short interval before pause, but the sequence is not atomic.

## 3. Broadcast only the approved plan

The sender supports a local encrypted JSON keystore for a dedicated EOA. It does not implement hardware-wallet signing. For institutional custody, have your signer integration independently reviewed rather than exporting a production owner key. The deployment wallet is temporary; the final owner can be a multisig.

Set these values through a protected shell/session or local secret manager:

- `ALPHA_DEPLOY_KEYSTORE`: private keystore path, with permissions `600`.
- `ALPHA_KEYSTORE_PASSWORD`: decryption password; do not put it in command history.
- `ALPHA_APPROVED_PLAN_HASH`: the exact independently reviewed plan hash.
- `ALPHA_DEPLOY_CONFIRM`: exactly `ethereum-mainnet`.
- Both RPC variables from the planning step.

```bash
npm run deploy:send -- /private/deployment-plan.json /private/new-deployment-journal
```

This spends real ETH. It rejects changed source/artifacts, expired plans, changed nonces, mismatched signer, wrong networks, token-code disagreement, insufficient balance and gas estimates above the reviewed limits. Before each broadcast it saves the signed transaction and hash in a new private journal. Each transaction requires 12 confirmations and agreement on its receipt from both providers. The sender never automatically retries, replaces or continues an existing journal.

**If interrupted, stop and reconcile.** Inspect every saved transaction hash using both providers and the explorer, including pending/reverted transactions. Do not rerun with a fresh directory or assume an absent receipt means nothing was sent. A signed transaction in a journal may still be broadcastable. Recover any partially deployed contracts deliberately before generating a new plan from the actual nonce. Never send the raw signed journal to reviewers or commit it to GitHub.

## 4. Verify source and finalized state

Export exact explorer-verification inputs to a fresh directory:

```bash
npm run deploy:export -- /private/source-verification
```

Each contract receives a Standard JSON input plus its exact compiler long version, fully qualified contract name and ABI-encoded constructor arguments. On [Etherscan](https://etherscan.io/verifyContract), select Solidity Standard JSON Input, the matching compiler and address, and the supplied arguments. Retain verification URLs and compare the published code to the reviewed inputs. A successful deployment alone is not explorer source verification.

Wait until all transactions are finalized, then run:

```bash
npm run deploy:verify -- /private/new-deployment-journal /private/finalized-verification.json
```

This checks canonical finalized receipts, exact transaction intent, deployed runtime bytecode, paused state, token binding and owner at a shared finalized block through both providers. Transaction type, chain, sender, recipient, calldata, nonce, value, gas limit and both EIP-1559 fee limits must match the approved plan exactly. An added access list is rejected. A replacement transaction with different fee or gas limits fails verification even if its contract effects match. A pending or non-finalized transaction fails. The output intentionally leaves explorer verification, owner-control proof and funded lifecycle qualification false; those require separate evidence.

## 5. Commission before enabling live node transactions

1. Retain the release commit, lockfiles, exact build inputs, approved plan, transaction hashes, finalized verification and explorer verification URLs.
2. Prove the final owner can operate the intended controls. Check the escrow/node/reviewer identities and the actual ENS resolution using independent sources.
3. Record RPC operator independence, private signer isolation, spending limits, incident contacts, backups and a restoration drill.
4. Configure bytecode pins from verified deployed runtime code, never from an untrusted single RPC response. Follow the [runtime transaction policy](alpha-runtime.md#live-identity-and-token-execution).
5. With explicit funding and action approval, run a small real funded mission through independent review, acceptance/claim and rejection/refund paths. Retain finalized receipts and reviewer evidence. Validate pause/recovery before raising limits.

## Upgrades and migration

v3.3.0 does not change Solidity source. The new optimized Hardhat artifacts are a distinct build from previous ad hoc compiler outputs; compare the complete build inputs before using a bytecode pin. Existing deployed contracts do not change when software updates.

For a future contract change, deploy and verify new contracts separately. Stop new admissions, reconcile existing accepted claims/refunds and all stake liabilities, preserve obligations, arrange authorized owner actions and reviewer continuity, and only then switch runtime pins and identity/configuration. There is no automatic custody migration or proxy upgrade in this repository.

References: [Hardhat configuration](https://hardhat.org/docs/reference/configuration), [Hardhat artifact format](https://hardhat.org/docs/reference/artifacts), [Ethereum gas](https://ethereum.org/en/developers/docs/gas/).
