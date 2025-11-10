# One-Click Container & Cluster Deployment

The Alpha Node container bundle delivers a self-contained runtime: the AI orchestrator, blockchain clients, network APIs, and telemetry endpoints are all packaged for institutional operators that need deterministic activation flows.

## Prerequisites

* Docker Engine ≥ 24 or a Kubernetes cluster for Helm.
* Access to an Ethereum RPC endpoint (Infura, Alchemy, or a private gateway).
* Operator ENS delegation such as `1.alpha.node.agi.eth` bound to the custody address.
* `$AGIALPHA` funding for staking and sufficient ETH for gas.

## Build & Single-Command Launch

```bash
# build the production image
docker build -t agi-alpha-node .

# customise operator.env based on the example
cp deploy/docker/operator.env.example deploy/docker/operator.env
$EDITOR deploy/docker/operator.env

# run the node with a single command
docker run \
  --name agi-alpha-node \
  --env-file deploy/docker/operator.env \
  -p 9464:9464 \
  -p 8080:8080 \
  agi-alpha-node
```

During start-up the container will:

1. Load configuration from the environment file or Vault (if configured).
2. Verify ENS ownership using on-chain registry + NameWrapper checks.
3. Evaluate staking posture and print deficit / penalty data.
4. Offer to broadcast `acknowledgeStakeAndActivate` when deficits are detected (interactive unless `AUTO_STAKE=true`).
5. Launch the monitoring loop, REST job API, and Prometheus `/metrics` endpoint.

If ENS verification fails the container exits immediately so misconfigured operators do not proceed.

## Staking & Funding Workflow

When the diagnostics step detects an underfunded stake, the runtime prints a funding checklist and (when `DRY_RUN=false`) can sign and broadcast the activation transaction. Operators should:

1. Transfer the desired `$AGIALPHA` amount to `OPERATOR_ADDRESS`.
2. Fund the address with enough ETH for the activation gas cost.
3. Re-run the container or press `y` at the interactive prompt to transmit the transaction.

For headless environments set:

```bash
AUTO_STAKE=true
DRY_RUN=false
OPERATOR_PRIVATE_KEY=0x<private-key>
```

Alternatively, provide Vault credentials (`VAULT_ADDR`, `VAULT_TOKEN`, `VAULT_SECRET_PATH`) and the runtime will hydrate `OPERATOR_PRIVATE_KEY` automatically before broadcasting.

## Offline Continuity

Operators can survive RPC or AI API outages by enabling the offline path:

```bash
mkdir -p deploy/docker/snapshots deploy/docker/models
cp path/to/snapshot.json deploy/docker/snapshots/operator.json
cp path/to/local-models.json deploy/docker/models/local-models.json

cat <<'ENV' >> deploy/docker/operator.env
OFFLINE_MODE=true
OFFLINE_SNAPSHOT_PATH=/snapshots/operator.json
LOCAL_MODEL_PATH=/models/local-models.json
ENV
```

With `OFFLINE_MODE=true` the job API switches to deterministic local models whenever the remote AI provider is unreachable, and staking data is sourced from the snapshot.

## Observability Stack

`deploy/docker/compose.yaml` wires the node together with Prometheus and Grafana for a turnkey control room:

```bash
# ensure the operator configuration exists
cp deploy/docker/operator.env.example deploy/docker/operator.env

# launch the monitoring stack
(cd deploy/docker && docker compose up -d)
```

* Prometheus scrapes `agi-alpha-node:9464/metrics` (job throughput, success ratio, projected token earnings).
* Grafana is exposed on `http://localhost:3000` with default credentials `admin/changeit`.

Metrics export includes stake balances, agent utilisation, runtime mode (remote/local/offline), and cumulative token earnings so auditors can inspect production yield in real time.

## Kubernetes / Helm

```bash
helm upgrade --install alpha-node deploy/helm/agi-alpha-node \
  --set image.repository=ghcr.io/montrealai/agi-alpha-node \
  --set image.tag=v1.1.0 \
  --set config.nodeLabel=1 \
  --set config.operatorAddress=0xYourOperatorAddress \
  --set config.rpcUrl=https://mainnet.infura.io/v3/<PROJECT_ID>
```

The chart provisions liveness/readiness probes, autoscaling hooks, Vault-powered secret hydration, and optional offline snapshot mounts. Combine it with a `ServiceMonitor` (enabled by default) to integrate into an institutional Prometheus deployment.
