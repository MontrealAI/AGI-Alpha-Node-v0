# Mission intelligence and specialist work

<!-- markdownlint-disable MD013 -->

v3.1 accepts evidence-backed missions for different objectives through the same reservation, review, action and settlement controls. The node analyzes supplied evidence; it does not independently establish the truth of sources or create execution authority from model text.

## General mission sources

A source file has `{ "schema": 1, "observedAt": "ISO UTC observation time", "mission": { ... } }`. The mission uses the format in [the example](../examples/alpha/mission-source.json): objective, sources, candidate opportunities, explicit economic assumptions and risk policy. Source IDs must be unique and every opportunity must reference an existing source. Use actual observation dates; replacing a stale timestamp does not create a fresh measurement.

Initialize with:

```bash
npm run alpha -- --home /absolute/private/node setup --ens yourname.alpha.node.agi.eth --reviewer 0xREVIEWER_ADDRESS --mission /absolute/path/source.json
```

Review `pipeline.json`. `sourceKind: "mission"` selects general mission admission; `"usage"` retains the caching discovery adapter. The source cannot loosen the pipeline's cost, downside, minimum-net or adverse-scenario policy: admission takes the stricter values. A content-derived mission ID binds the observation and effective policy. Identical inputs replay; changed inputs require new admission and review.

The source limit is 1 MB for general mission envelopes and 100 KB for usage observations. A collector uses the corresponding schema and freshness check. Model requests are limited to 2 MB, and specialist HTTP requests to 250 KB; larger missions can still use local deterministic analysis. Keep model input within the configured provider's context window as well.

## Model specialists

Two additional capabilities produce model work:

| Capability | Deliverable |
| --- | --- |
| `research-synthesis` | Findings with source quotations, counterarguments and testable next experiments |
| `adversarial-review` | A skeptical analysis of assumptions, adverse alternatives and disconfirming experiments |

The existing `evidence-analysis`, `risk-review` and `implementation-plan` capabilities remain deterministic. The legacy implementation-plan template concerns caching; use the new model roles for other domains.

On each separately initialized specialist, configure its private `config.json` provider as described in [START HERE](../START_HERE.md). It must support chat completions with JSON-schema response constraints. Configure provider-side spending limits. Set `specialist.json`, replacing the caller address:

```json
{
  "allowedCallers": ["0xCOORDINATOR_ADDRESS"],
  "capabilities": ["research-synthesis"],
  "priceMicroUsd": 10000,
  "maxDailyRequests": 10,
  "reserveMicroUsdPerRequest": 100000,
  "maxDailyReservedMicroUsd": 1000000
}
```

Start `npm run alpha -- --home /absolute/private/specialist specialist`. The listener binds loopback. Remote access requires an owner-managed TLS proxy. Configure an adversarial specialist similarly; using a distinct model or organization is an operational choice. Different addresses or role prompts alone do not establish independence.

Add their addresses/origins and desired capabilities to the coordinator's `engine.json`. Set `maxSpecialistPriceMicroUsd` and ensure the total maximum quoted amount fits the pipeline reservation. The specialist's inference reservation is a separate owner budget. Quotes do not automatically transfer money to peers; funded escrow operations remain explicit.

### Output verification and failure behavior

The model returns a strict object containing a summary, findings, citations, counterarguments, experiments and an abstention flag. The request carries a JSON schema and a bounded catalog of exact source excerpts. Citation alternatives pair each excerpt with its source ID. The receiver independently validates every returned quote against the original source text, even if the provider ignores schema constraints.

Schema compliance and quotation presence do not prove a claim follows from the quote. A reviewer must check entailment, context, source quality and missing evidence. All specialist results appear in the signed report; when a coordinator narrative provider is configured, it receives those results as untrusted evidence.

Signatures bind sender, recipient, capability, inputs, request ID, price and timestamps. A persistent reservation is written before inference. Completed results replay; failed or interrupted requests do not automatically retry. Daily request and inference reservations include failures. A process lock prevents simultaneous workers sharing the same specialist identity. Provider-side billing limits are still necessary because local reservations are estimates.

Model output cannot add shell commands, permissions, actions or token transfers. External execution remains an exact owner-configured scalar JSON change, bound into the reviewed report with preconditions, health checks and rollback. General computer use and arbitrary generated-code execution are outside this release's execution authority.

## Review an exported bundle

On the reviewer's machine, before signing:

```bash
npm run alpha -- verify-bundle evidence.json --expected-node 0xNODE_ADDRESS --expected-reviewer 0xREVIEWER_ADDRESS
```

Obtain expected addresses through an independent channel. This verifies signatures, computed rankings, report bytes, work identity, v2 specialist receipts and any included review/outcome records. `review-sign` performs the same internal verification automatically. These checks support the reviewer's judgment; acceptance still requires reviewing the actual evidence and proposed action.

## Reproduce real model qualification

The release's [research evidence](../evidence/v3.1.0/repository-research/execution.json) uses actual repository sources, two separate specialist processes, pinned Qwen3-4B-Instruct-2507-Q4_K_M model bytes and llama.cpp b11146. Both specialists use the same model and are controlled by the qualification harness. There is no independent human or paid buyer acceptance.

Download the GGUF from the [pinned quantizer revision](https://huggingface.co/unsloth/Qwen3-4B-Instruct-2507-GGUF/tree/a06e946bb6b655725eafa393f4a9745d460374c9), verify its SHA-256 below, and use the pinned llama.cpp build procedure in [runtime operations](alpha-runtime.md#real-model-qualification). The tested model is 2,497,281,120 bytes and needs substantially more memory than the earlier 0.6B model.

```bash
node scripts/qualify-local-model.mjs --research --threads 8 --timeout-ms 180000 --server /absolute/path/llama-server --model /absolute/path/Qwen3-4B-Instruct-2507-Q4_K_M.gguf --model-sha256 3605803b982cb64aead44f6c1b2ae36e3acdb41d8e46c8a94c6533bc4c67e597 --revision a06e946bb6b655725eafa393f4a9745d460374c9 --runtime "llama.cpp b11146" --out /absolute/new/evidence
```

Provider `timeoutMs` defaults to 60,000 and may be set between 1,000 and 180,000 for slower local inference. Model specialist coordination allows 190 seconds; deterministic peers retain a 15-second deadline.

The [smaller model's rejected draft](../evidence/v3.1.0/model-quality-rejection/assessment.json) and [larger model assessment](../evidence/v3.1.0/repository-research/assessment.json) document semantic limitations. Both produced verifiable source quotations, but neither qualifies for unreviewed operational reliance. The larger model distinguishes testing from deployment more clearly while still overstating some implications. The release does not equate running inference with solving general intelligence.

The harness checks replay without additional calls, verifies the exported receipts, performs encrypted recovery and confirms that production qualification remains incomplete. Model weights are downloaded separately. The schema transport follows the pinned runtime's [grammar documentation](https://github.com/ggml-org/llama.cpp/blob/b11146/grammars/README.md).
