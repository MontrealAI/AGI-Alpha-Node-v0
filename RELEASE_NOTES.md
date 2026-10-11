# AGI Alpha Node v3.3.0 — Guided Start & Deployment Edition

<!-- markdownlint-disable MD013 -->

Start at the new **[guided welcome page](https://montrealai.github.io/AGI-Alpha-Node-v0/)**. Explore an illustrative invoice check, choose English or French, enlarge the text, and get a short setup path for your goal and computer. Browsing requires no account, wallet or installation.

## What changed

- A lightweight public website with responsive layouts, keyboard navigation, a no-JavaScript guide, help and clearly labeled example data. GitHub Pages publication follows successful CI.
- Beginner instructions in English and French, a current documentation index, troubleshooting, and a separate advanced Ethereum operator guide. Historical flowcharts remain available in the legacy codex.
- Pinned Hardhat 3.19.0 / solc 0.8.37 builds, optimized Paris-target artifacts, local deployment/ownership/pause rehearsal, Standard JSON verification exports, read-only mainnet planning, bounded transaction signing with a private pre-broadcast journal, and two-provider finalized verification.
- Security dependency repairs in both lockfiles. Markdown lint retains its rules through the direct maintained engine; the subgraph glob override receives compatibility checks.
- PR #497's telemetry-disable fix, retaining the later shutdown-race repair.

## Install or upgrade

Download `AGI_Alpha_Node_v3.3.0.zip` and `SHA256SUMS.txt`, verify the ZIP, then follow [the beginner guide](docs/getting-started.md) or [le guide en français](docs/getting-started.fr.md). Use Node.js 22.14+ in a supported LTS line and npm 10+.

For an existing node, stop workers and follow [backup/recovery](docs/alpha-recovery.md). This release does not change the ledger schema or Solidity sources. The newly specified optimized Hardhat build has its own bytecode identity; software installation does not alter a deployed contract. Do not replace live bytecode pins without independent verification of the actual deployment.

## Validation and scope

Publication requires the full CI verification, including Linux tests/coverage, both dependency audits, subgraph build, Solidity checks, onboarding/deployment rehearsal, non-root Docker demonstrations and macOS clean-install workflows. See [release evidence](evidence/v3.3.0/validation.md) and the successful Actions run for this exact release commit.

The welcome page guides users into local software. It is not a managed cloud account and does not establish billion-user service capacity, general intelligence or earnings. Mainnet deployment, explorer verification, owner control, independent review and real funded commissioning remain operator-specific evidence. The deployment tooling defaults to local rehearsal or an explicit read-only plan; broadcasting requires an exact approved plan and a dedicated encrypted signer.
