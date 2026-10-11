# Public website, accessibility and scale

<!-- markdownlint-disable MD013 -->

The public entry point is [AGI Alpha Node](https://montrealai.github.io/AGI-Alpha-Node-v0/). Source is in `site/`. It is a small static website: HTML, CSS, JavaScript and an SVG icon. It does not depend on a CDN script, font service, model API, wallet provider or analytics service. Its example is an explicitly fictional browser illustration, not an invocation of the node.

## Accessibility and privacy

The page provides English and French, larger text, semantic landmarks, a skip link, visible keyboard focus, labeled radio groups, native expandable help, focus movement on step changes, polite status messages, mobile reflow, reduced-motion behavior and written guides when JavaScript is unavailable. Language and text-size preferences are the only values saved locally. Storage failure is supported. No information is submitted by the page. GitHub hosting may have its own server logs.

Automated checks cover navigation choices, language changes, blocked storage and link structure. Release review includes browser screenshots and keyboard/mobile checks. These checks do not constitute a complete WCAG certification or usability research with older adults. Report accessibility problems through the public issue tracker without including private information.

## Publish and verify

The main CI workflow validates site structure and the onboarding/deployment tests. A separate Pages workflow builds the static artifact on PRs and publishes successful CI commits on `main`. The GitHub repository's Pages source must be **GitHub Actions**. `workflow_dispatch` may publish only the current `main` after checking that commit's successful CI run. Release publication itself requires the full CI gate. The final verification job runs even when a prerequisite fails and explicitly rejects failed, skipped, cancelled or missing prerequisite results; a skipped dependency cannot satisfy the final merge gate.

Repository link validation maps the canonical welcome URL to the checked-out `site/index.html`, so a first publication can be validated before it exists online. Other links retain their normal checks.

After publication, verify the HTTPS page, English/French switch, first-run paths, local CSS/JS, mobile reflow and download destinations. The private operator interface printed by `serve` is a separate local service and must never be exposed through GitHub Pages.

## Preparing for a very large audience

This release improves first-time access. It does not demonstrate a billion-user backend. A static welcome page scales independently of node operation, wallet transactions, support and reviewers. GitHub Pages has published hosting limits, including a soft bandwidth limit of 100 GB per month; a global mass-market service must have an appropriate hosting and operations plan. See [GitHub Pages limits](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits).

Before a large campaign, measure page delivery and support demand; establish a production CDN/origin appropriate to the audience, availability objectives, rollbacks, incident ownership, language coverage and accessibility research. Benchmark the actual node workloads, model/provider quotas, RPC capacity and human review capacity independently. Do not infer active users, workload capacity or economic performance from page views or static-site availability.
