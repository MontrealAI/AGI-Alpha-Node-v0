# Verified invoice-reconciliation work

<!-- markdownlint-disable MD013 -->

Produce a reproducible analytical deliverable over the supplied records. Independently recompute the results before acceptance. No external change, refund or profit is authorized or established.

Analysis: deterministic-evidence-analysis
Input digest: 0xa5d1dc1260be0a6caef02aa44395579f266b15f25e9cd8a283a19d06cfccd46a
Units: USD; no benefit forecast
Recommendation: verified-analysis

| Opportunity | Expected net | Stressed net | Admitted | Evidence |
| --- | ---: | ---: | --- | --- |
| Compute and independently review the analytical result | 0.00 | 0.00 | Yes | work-input |

## Evidence and assumptions

- verified-analysis: Zero-dollar screening values grant analytical admission only. Actual provider/review costs require owner reservations and measurement; this analysis claims no financial benefit.

- work-input — Authorized work observation — SHA-256 0x5fea146e494608e8c2d149b0450ea80a782ade42455289bc18fc94492688922e
- input-observation — Observation envelope — SHA-256 0x4b7d9cef6d5b656627190412ff598ed9da0756591e7c657ae0ec69790d6d68fd
- adaptive-model — Owner-bounded outcome model — SHA-256 0x8376e006fa12b8eecb1fb71b19f17aff6c03532e0d8c3d3fc85e79faa8fc000d

## Verified computation over supplied data

Work result SHA-256: 0xa02998a623b93a44830babea7e68abcbaf904a40fc43c124eefca45fb346aca2

```json
{
  "services": 2,
  "knownRateOverbillingMicroUsd": "11000000",
  "netKnownRateVarianceMicroUsd": "11000000",
  "unknownRateServices": [],
  "duplicateInvoiceReferences": [
    "invoice-1-line-2"
  ]
}
```

Exact arithmetic over supplied records and rates. Missing usage, taxes, credits, contract terms and dishonest inputs can change the interpretation. Discrepancies are not confirmed receivables.

Complete rows are exported as work-result.json and work-results.csv. Source authenticity still requires review.

## Model-selected computed facts (priority is unverified)

- Supplied invoices exceed usage priced at supplied rates by 11000000 micro-USD across positive-variance services. This is a discrepancy to investigate, not a confirmed refund or measured profit.
- Service compute: quantity variance 2; billed 24000000 micro-USD; expected 20000000; monetary variance 4000000.
- Service storage: quantity variance 5; billed 12000000 micro-USD; expected 5000000; monetary variance 7000000.
- 1 repeated invoice references require review; their amounts are already included in totals.

## Runtime authorization

Acceptance authorizes only the exact action below. Model text and specialist responses cannot authorize additional actions.

Plan digest: 0xc51c948230346e52fa8866c7e24da3e66e410dc50e0e515208d840b5aa180eac

Authenticated specialist receipts: 1

### Specialist evidence

Signatures authenticate the peer. Exact-quote validation checks citation presence, not truth or entailment. Review these results before acceptance.

Peer: 0x1cb499e8d9d4c8da5757f2b653c47754647ac66b · Capability: evidence-analysis

```json
{
  "inputDigest": "0xa5d1dc1260be0a6caef02aa44395579f266b15f25e9cd8a283a19d06cfccd46a",
  "analysis": {
    "kind": "deterministic-evidence-analysis",
    "missionDigest": "0xa5d1dc1260be0a6caef02aa44395579f266b15f25e9cd8a283a19d06cfccd46a",
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
      "kind": "invoice-reconciliation",
      "inputDigest": "0xd66439d8c44a93e416cf9a16123a7b7bd2a1c290ddf8a9a07157924c1951e34d",
      "summary": {
        "services": 2,
        "knownRateOverbillingMicroUsd": "11000000",
        "netKnownRateVarianceMicroUsd": "11000000",
        "unknownRateServices": [],
        "duplicateInvoiceReferences": [
          "invoice-1-line-2"
        ]
      },
      "rows": [
        {
          "serviceId": "compute",
          "usageUnits": "10",
          "billedUnits": "12",
          "quantityVarianceUnits": "2",
          "expectedMicroUsd": "20000000",
          "billedMicroUsd": "24000000",
          "varianceMicroUsd": "4000000",
          "priceMismatchLineIds": [],
          "usageIds": [
            "u1"
          ],
          "invoiceIds": [
            "i1"
          ]
        },
        {
          "serviceId": "storage",
          "usageUnits": "5",
          "billedUnits": "10",
          "quantityVarianceUnits": "5",
          "expectedMicroUsd": "5000000",
          "billedMicroUsd": "12000000",
          "varianceMicroUsd": "7000000",
          "priceMismatchLineIds": [
            "i2",
            "i3"
          ],
          "usageIds": [
            "u2"
          ],
          "invoiceIds": [
            "i2",
            "i3"
          ]
        }
      ],
      "facts": [
        {
          "id": "total",
          "text": "Supplied invoices exceed usage priced at supplied rates by 11000000 micro-USD across positive-variance services. This is a discrepancy to investigate, not a confirmed refund or measured profit."
        },
        {
          "id": "service-0",
          "text": "Service compute: quantity variance 2; billed 24000000 micro-USD; expected 20000000; monetary variance 4000000."
        },
        {
          "id": "service-1",
          "text": "Service storage: quantity variance 5; billed 12000000 micro-USD; expected 5000000; monetary variance 7000000."
        },
        {
          "id": "duplicates",
          "text": "1 repeated invoice references require review; their amounts are already included in totals."
        }
      ],
      "limitation": "Exact arithmetic over supplied records and rates. Missing usage, taxes, credits, contract terms and dishonest inputs can change the interpretation. Discrepancies are not confirmed receivables."
    },
    "sources": [
      {
        "id": "work-input",
        "title": "Authorized work observation",
        "digest": "0x5fea146e494608e8c2d149b0450ea80a782ade42455289bc18fc94492688922e",
        "url": null
      },
      {
        "id": "input-observation",
        "title": "Observation envelope",
        "digest": "0x4b7d9cef6d5b656627190412ff598ed9da0756591e7c657ae0ec69790d6d68fd",
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
