# AGI Alpha Node Subgraph Deployment

This guide covers preparing, deploying, and verifying the AGI Alpha Node KPI subgraph that indexes `AlphaNodeManager` events. The subgraph tracks per-agent and per-node performance windows (7-day and 30-day) for minted, validated, accepted, and slashed Alpha Work Units.

## Prerequisites

- Node.js >= 20 and npm >= 10
- The Graph CLI (`npm install -g @graphprotocol/graph-cli`) or run it locally via `npx`
- Access to an Ethereum endpoint for the target network
- (For local testing) a running Graph Node stack ([Quickstart](https://thegraph.com/docs/en/developing/creating-a-subgraph/#local-development))

## Project setup

1. Install subgraph dependencies:
   ```bash
   cd subgraph
   npm install
   ```
2. Update `subgraph.yaml` with your deployment details:
   - Replace `{{alphaNodeManagerAddress}}` with the deployed `AlphaNodeManager` contract address.
   - Replace `{{alphaNodeManagerStartBlock}}` with a block number before the first relevant event on the target network.
   - Adjust the `network` value if you are indexing a chain other than mainnet.

## Build & deploy

Run the standard Graph CLI pipeline from the `subgraph` directory:

```bash
npm run codegen
npm run build
```

For hosted-service deployments:

```bash
graph auth --product hosted-service <DEPLOY_KEY>
graph deploy --product hosted-service <GITHUB_USER>/<SUBGRAPH_NAME>
```

For decentralized network or local Graph Node deployments, use the appropriate `graph deploy` flags described in The Graph documentation.

## Foundry/Hardhat validation flow

The repository includes `scripts/subgraph-simulation.js`, which spins up a local scenario, emits sample events, and asserts that the subgraph produces the expected KPI windows.

1. Start a local Ethereum JSON-RPC node (Hardhat, Anvil, or Ganache). Example:
   ```bash
   npx hardhat node
   # or
   anvil
   ```
2. Ensure a Graph Node is running locally and the subgraph has been deployed to it (default query URL `http://localhost:8000/subgraphs/name/agi-alpha-node`).
3. In another terminal, run the simulation script from the repository root:
   ```bash
   npm run simulate:subgraph
   ```
   - Override `RPC_URL` or `SUBGRAPH_URL` if your local services use different endpoints.
4. The script deploys `AlphaNodeManager`, forges identity/validator state, emits `AlphaWUMinted`, `AlphaWUValidated`, `AlphaWUAccepted`, and `SlashApplied` events, and queries the subgraph until the 7-day and 30-day KPI windows reflect the scenario.
5. A successful run prints `Subgraph metrics validated successfully.` Any mismatch or indexing issue causes the script to exit with a non-zero status and a descriptive error.

## Next steps

- Expand the schema/mapping if additional events or KPI dimensions are introduced.
- Adjust the simulation parameters (scores, slash amounts, validation counts) to cover more edge cases or stress-test indexing performance.
