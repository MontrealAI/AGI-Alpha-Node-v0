# One-Click Deployment Playbook

The Alpha Node container packages the full orchestrator, specialist-agent lattice,
blockchain integrations, and telemetry stack so institutions can stand up a
sovereign worker with a single command. This playbook captures the end-to-end
workflow for Docker and Kubernetes operators.

## Prerequisites

- Docker Engine 24+ or compatible Kubernetes cluster (1.27+ recommended).
- Access to an Ethereum RPC endpoint with archive support for historical
  diagnostics.
- ENS subdomain delegated from `alpha.node.agi.eth` (for example
  `1.alpha.node.agi.eth`).
- Operator wallet funded with ETH for gas fees and `$AGIALPHA` for staking.
- Optional: HashiCorp Vault or compatible secret manager for custodying the
  operator private key.

## Docker: Single Command Launch

1. **Prepare configuration** – copy the sample file and adjust values:

   ```bash
   cp deploy/docker/node.env.example node.env
   $EDITOR node.env
   ```

2. **Optional: mount offline snapshot** – export an offline snapshot from a
   trusted environment and place it next to the config:

   ```bash
   npx agi-alpha-node status \
     --label 1 \
     --address 0xYOUR_OPERATOR_ADDRESS \
     --rpc https://mainnet.infura.io/v3/<PROJECT_ID> \
     --write-offline-snapshot ./snapshot.json
   ```

3. **Launch the container** – the entrypoint automatically loads
   `/config/node.env` and enforces ENS + stake prerequisites:

   ```bash
   docker run -it --rm \
     --name agi-alpha-node \
     -p 8080:8080 \
     -p 9464:9464 \
     --env-file node.env \
     -v $(pwd)/node.env:/config/node.env:ro \
     -v $(pwd)/snapshot.json:/config/snapshot.json:ro \
     ghcr.io/montrealai/agi-alpha-node:latest
   ```

   At startup the container:

   - Loads configuration and validates `NODE_LABEL`, `OPERATOR_ADDRESS`, and
     `RPC_URL`.
   - Verifies the ENS subdomain matches the operator address (fails fast when
     mismatched).
   - Starts the agent REST interface on `API_PORT` (default `8080`).
   - Exposes Prometheus metrics on `METRICS_PORT` (default `9464`) and
     registers the Docker healthcheck.
   - Detects stake deficits; when `AUTO_STAKE=true` and the private key +
     incentives address are present it prompts for/executes
     `acknowledgeStakeAndActivate`.
   - Falls back to local models automatically when AI APIs are unreachable or
     `OFFLINE_MODE=true`.

4. **Monitor & operate** – inspect logs, metrics, and the REST API:

   ```bash
   docker logs -f agi-alpha-node
   curl -sS http://localhost:8080/healthz | jq
   curl -sS http://localhost:8080/jobs | jq '.jobs | length'
   curl -sS http://localhost:9464/metrics | grep agi_alpha_node
   ```

5. **Funding guidance** – when staking is required the container logs:

   - The exact `$AGIALPHA` deficit detected.
   - Funding steps for the operator wallet (transfer `$AGIALPHA`, provision ETH
     for gas, rerun with `AUTO_STAKE=true`).
   - Confirmation prompts if `INTERACTIVE_STAKE=true` and a TTY is available.

## Kubernetes: Helm Chart Deployment

1. **Render secrets** – create a Kubernetes secret (or enable Vault injection)
   that stores the operator private key and optional Vault token:

   ```bash
   kubectl create secret generic agi-alpha-node-secrets \
     --from-literal=operatorPrivateKey=0xYOUR_PRIVATE_KEY \
     --from-literal=vaultToken=YOUR_VAULT_TOKEN \
     --namespace agi-alpha
   ```

2. **Install/upgrade the chart** – the chart includes autoscaling,
   liveness/readiness probes, and Prometheus annotations:

   ```bash
   helm upgrade --install agi-alpha-node ./deploy/helm/agi-alpha-node \
     --namespace agi-alpha --create-namespace \
     --set config.nodeLabel=1 \
     --set config.operatorAddress=0xYOUR_OPERATOR_ADDRESS \
     --set config.rpcUrl=https://mainnet.infura.io/v3/<PROJECT_ID> \
     --set config.platformIncentivesAddress=0xINCENTIVES \
     --set config.autoStake=true \
     --set secretConfig.operatorPrivateKey=0xYOUR_PRIVATE_KEY \
     --set secretConfig.vaultToken=YOUR_VAULT_TOKEN
   ```

3. **Offline resilience** – mount a validated snapshot by enabling the optional
   ConfigMap:

   ```bash
   helm upgrade --install agi-alpha-node ./deploy/helm/agi-alpha-node \
     --namespace agi-alpha \
     --set offlineSnapshot.enabled=true \
     --set offlineSnapshot.configMapName=agi-alpha-node-offline \
     --set config.offlineSnapshotPath=/config/offline-snapshot.json
   ```

4. **Autoscaling** – toggle horizontal pod autoscaling to maintain throughput
   while ensuring zero-downtime rollouts:

   ```bash
   helm upgrade --install agi-alpha-node ./deploy/helm/agi-alpha-node \
     --namespace agi-alpha \
     --set autoscaling.enabled=true \
     --set autoscaling.minReplicas=2 \
     --set autoscaling.maxReplicas=6 \
     --set autoscaling.targetCPUUtilizationPercentage=55
   ```

5. **Observability** – scrape Prometheus metrics using the built-in annotations
   or ServiceMonitor manifest. Grafana dashboards can ingest gauges for stake
   balance, job throughput, success rates, token earnings, and provider mode
   (`remote`, `local`, `offline`).

## Environment Variables & Secrets

- `NODE_LABEL` – ENS label (e.g., `1` for `1.alpha.node.agi.eth`).
- `OPERATOR_ADDRESS` – Ethereum address expected to own the ENS subdomain and
  hold stake.
- `RPC_URL` – Ethereum RPC endpoint used for ENS, staking, and governance
  diagnostics.
- `ENS_PARENT_DOMAIN` – Parent ENS domain (defaults to `alpha.node.agi.eth`).
- `PLATFORM_INCENTIVES_ADDRESS` – Contract used for
  `acknowledgeStakeAndActivate`. Required for auto staking.
- `AUTO_STAKE` – When `true`, automatically broadcasts stake activation if
  deficits are detected.
- `OPERATOR_PRIVATE_KEY` – Private key used for staking transactions (safely
  stored via secrets manager).
- `OFFLINE_MODE` – Forces local/offline intelligence runtime when `true`.
- `OFFLINE_SNAPSHOT_PATH` – Absolute path to a validated offline snapshot JSON
  file.
- `LOCAL_MODEL_PATH` – Optional path to a JSON file describing
  institution-approved local models.
- `METRICS_PORT` / `API_PORT` – Expose Prometheus metrics and the job intake
  REST API.
- `VAULT_ADDR`, `VAULT_TOKEN`, `VAULT_SECRET_PATH`, `VAULT_SECRET_KEY` – Enable
  secret hydration from Vault during bootstrap.

## Health & Restart Strategy

- Docker uses `HEALTHCHECK` to poll `/metrics`; combine with `--restart
  unless-stopped` to auto-recover from agent crashes.
- Helm ships `livenessProbe` on `/metrics` and `readinessProbe` on `/healthz`
  to integrate with Kubernetes restart semantics.
- Local/offline model fallbacks keep job evaluation operational even when
  OpenAI or other remote APIs are unavailable.

## Troubleshooting

- **Container exits immediately** – Inspect logs for ENS verification errors.
  Ensure the ENS subdomain resolves to `OPERATOR_ADDRESS` and the label omits
  the parent domain.
- **Auto staking skipped** – Confirm `AUTO_STAKE=true`,
  `PLATFORM_INCENTIVES_ADDRESS` set, and `OPERATOR_PRIVATE_KEY` available
  (directly or via Vault).
- **Offline mode active unexpectedly** – Check remote AI provider availability
  and ensure `AI_API_URL` is reachable; override by clearing `OFFLINE_MODE`.
- **Metrics empty** – Verify port mappings and that the process has reached the
  monitoring phase; the healthcheck will also fail if `/metrics` is
  unavailable.

---

This playbook enables institutions to operate Alpha Nodes with minimal ceremony
while preserving full transparency over identity proofs, staking posture, and
job throughput.
