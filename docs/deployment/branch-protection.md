# Branch Protection & ENS Gating

The `main` branch is locked behind CI and ENS-aware controls so only
authorized operators can land critical changes or flip deployment health
states.

## Required status checks

Configure GitHub branch protection for `main` with the following checks
from [`./.github/required-checks.json`](../../.github/required-checks.json):

1. **Lint Markdown & Links** – validates docs and cross-references.
2. **Unit & Integration Tests** – runs the Vitest suite.
3. **Coverage Report** – produces LCOV output and a coverage badge payload.
4. **Docker Build & Smoke Test** – builds the production image and
   captures CLI health output.
5. **Solidity Lint & Compile** – runs `solhint` plus `solcjs` to keep contracts deploy-ready.
6. **Subgraph TypeScript Build** – runs `graph build` against the subgraph mappings.
7. **Dependency Security Scan** – executes `npm audit --audit-level=high`.

Mark each check as _required_ and enable “Require status checks to pass
before merging.” Combine this with “Require pull request reviews” so at
least one owner signs off before the merge gate opens.

## ENS-based merge gating

[`scripts/verify-branch-gate.mjs`](../../scripts/verify-branch-gate.mjs)
enforces that any branch prefixed with `deploy/`, `release/`, or
`hotfix/` contains an ENS subname that matches the runtime health gate
allowlist (`*.agent.agi.eth`, `*.alpha.node.agi.eth`, etc.).

- Example branch: `deploy/validator-alpha.node.agi.eth/resume` → authorized.
- Unauthorized example: `release/community-fork` → fails CI because the
  ENS segment is missing.

If a branch is not marked as merge-critical it skips the ENS check but
still inherits the CI and review requirements.

## Shields.io badge publishing

The `badges` job collects job results and coverage output, then pushes
JSON payloads to a GitHub gist. Create a private gist and add these
repository secrets so the workflow can update it:

- `BADGE_GIST_ID` – the gist identifier (e.g., `0123456789abcdef0123456789abcdef`).
- `BADGE_GIST_TOKEN` – a GitHub personal access token with the `gist`
  scope that owns the gist above.

Reference the badges from the README with URLs of the form:

```text
https://img.shields.io/endpoint?url=https://gist.githubusercontent.com/<owner>/<gist-id>/raw/<badge>.json
```

Replace `<owner>` and `<gist-id>` with the gist coordinates, and `<badge>`
with `lint.json`, `test.json`, `solidity.json`, `typescript.json`,
`security.json`, `docker.json`, or `coverage.json`.

## Merge checklist

1. Open the pull request from a branch that respects the ENS naming
   convention if it is merge-critical.
2. Ensure all seven required status checks turn green.
3. Wait for an owner review and approval.
4. Merge via squash or rebase (no direct pushes to `main`).
5. On merge, observe the README badges updating via the gist payloads.
