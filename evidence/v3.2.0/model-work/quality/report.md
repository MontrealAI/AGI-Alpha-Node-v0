# Verified data-quality work

<!-- markdownlint-disable MD013 -->

Produce a reproducible analytical deliverable over the supplied records. Independently recompute the results before acceptance. No external change, refund or profit is authorized or established.

Analysis: deterministic-evidence-analysis
Input digest: 0xd896215b4882f4c121e38c37ab37ce996a816ff50573f4e1d921eb2ef9c0ceb9
Units: USD; no benefit forecast
Recommendation: verified-analysis

| Opportunity | Expected net | Stressed net | Admitted | Evidence |
| --- | ---: | ---: | --- | --- |
| Compute and independently review the analytical result | 0.00 | 0.00 | Yes | work-input |

## Evidence and assumptions

- verified-analysis: Zero-dollar screening values grant analytical admission only. Actual provider/review costs require owner reservations and measurement; this analysis claims no financial benefit.

- work-input — Authorized work observation — SHA-256 0x67470796c9f08d90f1fe474be6a4bcb5ab68829ec8946354a3d2ce2ccc84c911
- input-observation — Observation envelope — SHA-256 0xc8269c6af8a578fbbe0cf6759dbc2a8b9ef7ed58bd7390214f39915805ef448e
- adaptive-model — Owner-bounded outcome model — SHA-256 0x8376e006fa12b8eecb1fb71b19f17aff6c03532e0d8c3d3fc85e79faa8fc000d

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

## Model-selected computed facts (priority is unverified)

- 4 rule violations affect 2 of 3 supplied rows under 4 explicit rules. Passing these rules does not establish overall data truth or completeness.
- Rule account-required (required, field account) found 1 violations.
- Rule account-unique (unique, field account) found 1 violations.
- Rule quantity-range (range, field quantity) found 1 violations.
- Rule status-known (one-of, field status) found 1 violations.

## Runtime authorization

Acceptance authorizes only the exact action below. Model text and specialist responses cannot authorize additional actions.

Plan digest: 0x5f25d68ec2ec2a574b65770f6526aeb38bf732072ea4c22beb96f41d9998505c

Authenticated specialist receipts: 1

### Specialist evidence

Signatures authenticate the peer. Exact-quote validation checks citation presence, not truth or entailment. Review these results before acceptance.

Peer: 0x1cb499e8d9d4c8da5757f2b653c47754647ac66b · Capability: evidence-analysis

```json
{
  "inputDigest": "0xd896215b4882f4c121e38c37ab37ce996a816ff50573f4e1d921eb2ef9c0ceb9",
  "analysis": {
    "kind": "deterministic-evidence-analysis",
    "missionDigest": "0xd896215b4882f4c121e38c37ab37ce996a816ff50573f4e1d921eb2ef9c0ceb9",
    "unit": "USD; no benefit forecast",
    "recommendation": "verified-analysis",
    "rankings": [
      {
        "id": "verified-analysis",
        "title": "Compute and independently review the analytical result",
        "benefit": 0,
        "cost": 0,
        "probability": 1,
        "downside": 0,
        "sourceIds": [
          "work-input"
        ],
        "rationale": "Zero-dollar screening values grant analytical admission only. Actual provider/review costs require owner reservations and measurement; this analysis claims no financial benefit.",
        "expectedNet": 0,
        "stressedNet": 0,
        "admitted": true
      }
    ],
    "work": {
      "schema": 1,
      "kind": "data-quality",
      "inputDigest": "0x509c2652219e1bff17988139d651757bfddc4defabe5e5300a71837b20163ba2",
      "summary": {
        "inputRows": 3,
        "rules": 4,
        "violations": 4,
        "affectedRows": 2,
        "passingRows": 1
      },
      "rows": [
        {
          "rowId": "r3",
          "ruleId": "account-required",
          "field": "account",
          "issue": "missing",
          "actual": ""
        },
        {
          "rowId": "r2",
          "ruleId": "account-unique",
          "field": "account",
          "issue": "duplicate-of:r1",
          "actual": "acct-a"
        },
        {
          "rowId": "r2",
          "ruleId": "quantity-range",
          "field": "quantity",
          "issue": "outside-range-or-not-number",
          "actual": -1
        },
        {
          "rowId": "r2",
          "ruleId": "status-known",
          "field": "status",
          "issue": "not-allowed",
          "actual": "unknown"
        }
      ],
      "facts": [
        {
          "id": "quality",
          "text": "4 rule violations affect 2 of 3 supplied rows under 4 explicit rules. Passing these rules does not establish overall data truth or completeness."
        },
        {
          "id": "rule-0",
          "text": "Rule account-required (required, field account) found 1 violations."
        },
        {
          "id": "rule-1",
          "text": "Rule account-unique (unique, field account) found 1 violations."
        },
        {
          "id": "rule-2",
          "text": "Rule quantity-range (range, field quantity) found 1 violations."
        },
        {
          "id": "rule-3",
          "text": "Rule status-known (one-of, field status) found 1 violations."
        }
      ],
      "limitation": "Evaluates only supplied rows and explicit rules. Uniqueness is type-sensitive and marks subsequent occurrences; missing values require a required rule. No external source authenticity or regulatory compliance is certified."
    },
    "sources": [
      {
        "id": "work-input",
        "title": "Authorized work observation",
        "digest": "0x67470796c9f08d90f1fe474be6a4bcb5ab68829ec8946354a3d2ce2ccc84c911",
        "url": null
      },
      {
        "id": "input-observation",
        "title": "Observation envelope",
        "digest": "0xc8269c6af8a578fbbe0cf6759dbc2a8b9ef7ed58bd7390214f39915805ef448e",
        "url": null
      },
      {
        "id": "adaptive-model",
        "title": "Owner-bounded outcome model",
        "digest": "0x8376e006fa12b8eecb1fb71b19f17aff6c03532e0d8c3d3fc85e79faa8fc000d",
        "url": null
      }
    ],
    "limitations": [
      "Benefits, costs and probabilities are supplied assumptions, not forecasts established by this computation.",
      "Source hashes establish integrity, not truth. Independent review is required.",
      "No trades, external actions, token earnings or AGI capability are implied by this report."
    ]
  }
}
```

No external action is proposed.

## Limits

- Benefits, costs and probabilities are supplied assumptions, not forecasts established by this computation.
- Source hashes establish integrity, not truth. Independent review is required.
- No trades, external actions, token earnings or AGI capability are implied by this report.
