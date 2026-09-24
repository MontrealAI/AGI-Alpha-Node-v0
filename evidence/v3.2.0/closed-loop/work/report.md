# Verified data-quality work

<!-- markdownlint-disable MD013 -->

Produce a reproducible analytical deliverable over the supplied records. Independently recompute the results before acceptance. No external change, refund or profit is authorized or established. After independent acceptance, execute only the exact execution-policy descriptor and rollback on failed health verification.

Analysis: deterministic-evidence-analysis
Input digest: 0x770711ef77c2c6fbfbc5cb3f5e6e5760c4939ecd6310f83337705c6d380c1913
Units: USD; no benefit forecast
Recommendation: verified-analysis

| Opportunity | Expected net | Stressed net | Admitted | Evidence |
| --- | ---: | ---: | --- | --- |
| Compute and independently review the analytical result | 0.00 | 0.00 | Yes | work-input |

## Evidence and assumptions

- verified-analysis: Zero-dollar screening values grant analytical admission only. Actual provider/review costs require owner reservations and measurement; this analysis claims no financial benefit.

- work-input — Authorized work observation — SHA-256 0x755edeaf869089220d5e8c352bceaff665904043547a0b424df9552fcb3aa172
- input-observation — Observation envelope — SHA-256 0x3f2ca085ac21a0d2b95b6d51605e47bd0b5dfaf7677702b3f29ceb206fea6640
- adaptive-model — Owner-bounded outcome model — SHA-256 0xc2eed280d942318af6a47472b6649761fda2cd6c486b3f1b0e44efa12f850bd3
- execution-policy — Exact owner-authorized action reviewed with this mission — SHA-256 0xc32e74b647df66671faa53c67548871b03af5eac159bd9d5c1aaa597136f222f

## Verified computation over supplied data

Work result SHA-256: 0xd0136a3978f502d17ed5c34215a8085bc5c31c7d8e7f9d0dc2fc5397e4081084

```json
{
  "inputRows": 3,
  "rules": 4,
  "violations": 4,
  "affectedRows": 2,
  "passingRows": 1
}
```

Evaluates only supplied rows and explicit rules. Uniqueness is type-sensitive and marks subsequent occurrences; missing values require a required rule. No external source authenticity or regulatory compliance is certified.

Complete rows are exported as work-result.json and work-results.csv. Source authenticity still requires review.

## Runtime authorization

Acceptance authorizes only the exact action below. Model text and specialist responses cannot authorize additional actions.

Plan digest: 0x0d7a05ae608e805c0d1ed4745abcb090d58319b7ff4b2f8d9da8737c6c6fef00

Authenticated specialist receipts: 1

### Specialist evidence

Signatures authenticate the peer. Exact-quote validation checks citation presence, not truth or entailment. Review these results before acceptance.

Peer: 0xfd3f8bf1a312429de7da798851e3882acdf8f1f6 · Capability: risk-review

```json
{
  "inputDigest": "0x770711ef77c2c6fbfbc5cb3f5e6e5760c4939ecd6310f83337705c6d380c1913",
  "recommendation": "verified-analysis",
  "findings": [
    {
      "id": "verified-analysis",
      "admitted": true,
      "stressedNet": 0,
      "lossIfNoBenefit": 0
    }
  ],
  "requiredChecks": [
    "Source truth",
    "Uniform cost assumption",
    "Privacy and correctness",
    "Independent observed outcome"
  ]
}
```

Proposed action (not yet executed):

```json
{
  "action": {
    "kind": "json-set",
    "root": "/tmp/alpha-tx-XxCfOz",
    "file": "service.json",
    "pointer": [
      "cacheEnabled"
    ],
    "value": true,
    "healthUrl": "http://127.0.0.1:38095/health",
    "healthField": "healthy",
    "healthValue": true,
    "timeoutMs": 1000
  },
  "beforeHash": "0x421ae6438e43bf56ce6d03c6bb7a1b2b4593ca9eaa6efcb4187f486f7a8420ad",
  "afterHash": "0x92ed3c4a9d67fa4de5f39c7aaf5d7aca0d94b9b6c77dc5cd44e52fa35e502178",
  "target": "/tmp/alpha-tx-XxCfOz/service.json",
  "mode": 420,
  "unchanged": false
}
```

## Limits

- Benefits, costs and probabilities are supplied assumptions, not forecasts established by this computation.
- Source hashes establish integrity, not truth. Independent review is required.
- No trades, external actions, token earnings or AGI capability are implied by this report.
