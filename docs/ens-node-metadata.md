# ENS Metadata Specification · AGI Alpha Node

This document defines the canonical ENS record layout for AGI Alpha Nodes. Every production node **must** expose the following text and multi-coin records so downstream agents can authenticate and route value to the correct operator.

## Required Text Records

| Key | Description | Source |
| --- | --- | --- |
| `agialpha_verifier` | Base URL for the public verifier API. | `VERIFIER_PUBLIC_BASE_URL` |
| `agialpha_health` | Fully-qualified health endpoint URL. | `${VERIFIER_PUBLIC_BASE_URL}/verifier/health` |
| `agialpha_model` | Primary model/runtime identifier advertised by the node. | `NODE_PRIMARY_MODEL` |
| `agialpha_commit` | Git commit hash of the node build. | `GIT_COMMIT_HASH` env (or `git rev-parse HEAD`) |

## Required Multi-Coin Addresses

| Coin | Description | Source |
| --- | --- | --- |
| `ETH` | Default ETH payout address for settlement. | `NODE_PAYOUT_ETH_ADDRESS` (fallback `OPERATOR_ADDRESS`) |
| `AGIALPHA` | AGIALPHA token settlement/staking address. | `NODE_PAYOUT_AGIALPHA_ADDRESS` (fallback `NODE_PAYOUT_ETH_ADDRESS`) |

## JSON Template Helper

Run the CLI to generate the JSON template for your current configuration:

```bash
node src/index.js ens:records
```

Example output:

```json
{
  "ens_name": "orchestrator.alpha.node.agi.eth",
  "version": "1.1.0",
  "text_records": {
    "agialpha_verifier": "https://node.alpha/",
    "agialpha_health": "https://node.alpha/verifier/health",
    "agialpha_model": "orchestrator-hypernet:v1",
    "agialpha_commit": "d41d8cd98f00b204e9800998ecf8427e"
  },
  "coin_addresses": {
    "ETH": "0x0000000000000000000000000000000000000001",
    "AGIALPHA": "0x0000000000000000000000000000000000000001"
  }
}
```

Include all keys even if their values are identical to highlight the node’s intended payout routing.
