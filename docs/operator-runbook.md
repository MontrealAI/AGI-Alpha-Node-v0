# Operator Runbook · Verification & Deployment Rituals

This field guide captures the minimum viable checks that on-call operators and
reviewers must perform before merging or deploying the AGI Alpha Node runtime.

## 1. Verify Status Badges

1. Open [`README.md`](../README.md) and confirm that the CI badge references
   `actions/workflows/ci.yml?branch=main`.
2. Validate badge freshness directly.

   ```bash
   curl -I \
     https://github.com/MontrealAI/AGI-Alpha-Node-v0/actions/workflows/ci.yml/badge.svg?branch=main
   ```

   An HTTP `200` response indicates that the badge URL is valid and will update
   with the latest run.
3. Confirm the branch protection badge is present both in the root README and
   [`docs/README.md`](README.md) so governance rules surface in each entry point.

## 2. Enforce Required Status Checks

1. The canonical list of required checks lives in
   [`.github/required-checks.json`](../.github/required-checks.json). Reviewers
   must ensure GitHub branch protection references these job names: `Lint
   Markdown & Links`, `Unit & Integration Tests`, `Coverage Report`, and `Docker
   Build & Smoke Test`.
2. Use the GitHub CLI (or API) to validate branch protection before approving.

   ```bash
   gh api repos/MontrealAI/AGI-Alpha-Node-v0/branches/main/protection \
     --method GET \
     | jq '.required_status_checks.contexts'
   ```

3. If the output omits any status, update the repository settings and document
   the correction in the pull request thread.

## 3. Mirror CI Locally

Run the same scripts that CI executes before pushing a branch.

```bash
npm run ci:lint
npm run ci:test
npm run ci:coverage
```

A convenience wrapper `npm run ci:verify` executes the full matrix. Husky
enforces `ci:lint` and `ci:test` on every local commit to prevent broken
pipelines from leaving developer machines.

## 4. Coverage Artifacts

1. CI publishes a `coverage-report` artifact on every run. From the GitHub
   Actions UI, download the archive and ingest `coverage/lcov.info` into your
   preferred coverage visualizer.
2. When auditing coverage offline, run `npm run ci:coverage` locally and inspect
   the generated `coverage/` directory before archiving it with the release
   notes.

## 5. Container Build & Smoke Testing

1. Build the production container locally to ensure parity with CI.

   ```bash
   docker build --tag agi-alpha-node:local .
   ```

2. Execute the smoke test to confirm the container emits the CLI help banner
   without requiring live network credentials.

   ```bash
   docker run --rm \
     -e NODE_LABEL=smoke \
     -e OPERATOR_ADDRESS=0x0000000000000000000000000000000000000001 \
     -e RPC_URL=https://rpc.invalid \
     agi-alpha-node:local --help
   ```

   The command should exit `0` and display the CLI usage instructions.

## 6. Helm Chart Validation & Release Readiness

1. Lint the Helm chart before promoting a release candidate.

   ```bash
   helm lint deploy/helm/agi-alpha-node
   ```

2. Render the manifests with representative values to verify environment
   overrides.

   ```bash
   helm template agi-alpha-node ./deploy/helm/agi-alpha-node \
     --set image.tag=$(git rev-parse --short HEAD) \
     --set config.operatorAddress=0x0000000000000000000000000000000000000001 \
     --set config.rpcUrl=https://rpc.invalid
   ```

3. Capture the rendered manifests and lint reports in the deployment ticket for
   traceability.

Document completion of these checks in the pull request using the provided
template to maintain an auditable compliance trail.
