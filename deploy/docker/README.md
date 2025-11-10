# AGI Alpha Node Container Playbook

This guide explains how to launch the full Alpha Node runtime from a single Docker command.
It bundles the orchestrator, intelligence agents, blockchain integrations, monitoring, and
stake automation that institutional operators need to run in production.

## 1. Build or Pull the Image

```bash
# pull the pre-built image from GitHub Container Registry
docker pull ghcr.io/montrealai/agi-alpha-node:latest

# or build locally
docker build -t agi-alpha-node:local .
```

## 2. Prepare Configuration

The container accepts either inline environment variables or an env file mounted via `CONFIG_PATH`.
Copy the provided template and adjust the values for your operator account:

```bash
cp deploy/docker/node.env.example node.env
$EDITOR node.env
```

Key parameters:

| Variable | Purpose |
| -------- | ------- |
| `NODE_LABEL` | ENS label (e.g. `1`) for `<label>.alpha.node.agi.eth`. |
| `OPERATOR_ADDRESS` | Ethereum address that owns the ENS subdomain. |
| `RPC_URL` | Ethereum mainnet RPC endpoint. |
| `PLATFORM_INCENTIVES_ADDRESS` | Contract that exposes `acknowledgeStakeAndActivate`. |
| `OPERATOR_PRIVATE_KEY` | Private key for automated staking (omit when using Vault). |
| `AUTO_STAKE` / `INTERACTIVE_STAKE` | Enable unattended or prompted staking flows. |
| `DRY_RUN` | Leave `true` during tests; set to `false` to broadcast transactions. |
| `OFFLINE_SNAPSHOT_PATH` | Optional JSON snapshot for air-gapped continuity. |

Secrets can also be hydrated from HashiCorp Vault by setting `VAULT_ADDR`, `VAULT_SECRET_PATH`, `VAULT_SECRET_KEY`, and `VAULT_TOKEN`.

## 3. One Command Launch

```bash
docker run -it --rm \
  -p 8080:8080 \
  -p 9464:9464 \
  --env-file node.env \
  -e CONFIG_PATH=/config/node.env \
  -v $(pwd)/node.env:/config/node.env:ro \
  ghcr.io/montrealai/agi-alpha-node:latest
```

What happens during startup:

1. `/entrypoint.sh` loads the env file (if present) and validates required variables.
2. `agi-alpha-node container` verifies ENS ownership using on-chain registry + NameWrapper checks.
3. Stake posture is evaluated; when below the threshold the runtime walks operators through `acknowledgeStakeAndActivate`.
4. The REST agent API listens on `API_PORT` for job submissions and `/healthz` probes.
5. Prometheus metrics are served on `METRICS_PORT`, feeding Docker health checks and any ServiceMonitor.

## 4. Funding & Staking Checklist

1. **Fund the operator:** transfer the desired `$AGIALPHA` plus enough ETH to cover gas to the operator address.
2. **Approve tokens:** if using an external wallet, approve the `PLATFORM_INCENTIVES_ADDRESS` (and/or stake manager) to spend `$AGIALPHA`.
3. **Disable dry-run:** set `DRY_RUN=false` when you are ready for real transactions.
4. **Launch the container:** the bootstrap loop prompts for stake amounts (or auto-broadcasts when `AUTO_STAKE=true`).
5. **Confirm activation:** review logs for the transaction hash and verify status via `npx agi-alpha-node status` or chain explorers.

## 5. Offline Continuity

* Mount a signed snapshot JSON and expose its path through `OFFLINE_SNAPSHOT_PATH`.
* Set `OFFLINE_MODE=true` to force the meta-agent to use local heuristics when the OpenAI API is unavailable.
* Docker and Kubernetes health checks monitor `/metrics` so the runtime restarts automatically after transient failures.

## 6. Observability

* Prometheus gauges track stake balance, minimum thresholds, job throughput, success rate, and projected token earnings.
* Logs are structured JSON via `pino`, allowing ingestion into any SIEM pipeline.
* For Kubernetes clusters, enable the bundled ServiceMonitor (`prometheus.serviceMonitor.enabled=true`) to scrape metrics across replicas.

With this workflow, an institution can go from zero to a verifiable, monitored Alpha Node by running a single Docker command.
