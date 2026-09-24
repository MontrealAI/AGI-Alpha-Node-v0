# Verified resource-allocation work

<!-- markdownlint-disable MD013 -->

Produce a reproducible analytical deliverable over the supplied records. Independently recompute the results before acceptance. No external change, refund or profit is authorized or established.

Analysis: deterministic-evidence-analysis
Input digest: 0x46641b90024eb2006758f5b04498caf00fc75b364a256e2c306e4e0784685b27
Units: USD; no benefit forecast
Recommendation: verified-analysis

| Opportunity | Expected net | Stressed net | Admitted | Evidence |
| --- | ---: | ---: | --- | --- |
| Compute and independently review the analytical result | 0.00 | 0.00 | Yes | work-input |

## Evidence and assumptions

- verified-analysis: Zero-dollar screening values grant analytical admission only. Actual provider/review costs require owner reservations and measurement; this analysis claims no financial benefit.

- work-input — Authorized work observation — SHA-256 0x94ff37b1de0a081d9935205cfc2469ada66ac688009cc1ebf9b01f5f4d26ccc0
- input-observation — Observation envelope — SHA-256 0xade6e04aefa87c1bdc35264814619c371d2da36eddf4bd776519c92fa620137e
- adaptive-model — Owner-bounded outcome model — SHA-256 0x8376e006fa12b8eecb1fb71b19f17aff6c03532e0d8c3d3fc85e79faa8fc000d

## Verified computation over supplied data

Work result SHA-256: 0x86c998ba7ca39055ff2207e010fc465736692e3b2f1bf5c902608245c2d623df

```json
{
  "selectedIds": [
    "b",
    "c"
  ],
  "declaredNetMicroUsd": "80000000",
  "capitalMicroUsd": "100000000",
  "computeUnits": 8,
  "reviewMinutes": 16,
  "optimalWithinSuppliedCandidates": true,
  "examinedSubsets": 8
}
```

Exact finite optimization of owner-supplied estimates, not a forecast or execution authorization. At most 16 indivisible candidates; no scheduling, market access or external payments are implied.

Complete rows are exported as work-result.json and work-results.csv. Source authenticity still requires review.

## Model-selected computed facts (priority is unverified)

- Selected feasible subset: b, c, with declared net 80000000 micro-USD. These benefits are supplied estimates, not realized returns.
- Selected capacity: 100000000 micro-USD capital, 8 compute units, 16 review minutes.
- All 8 subsets of the 3 supplied candidates were evaluated. Optimality applies only to this finite candidate set and its declared objective and constraints.

## Runtime authorization

Acceptance authorizes only the exact action below. Model text and specialist responses cannot authorize additional actions.

Plan digest: 0xf08a55645d04002a27ee71a7f89d759ed203b4ef094b33c9c4ac4dd28f84e50b

Authenticated specialist receipts: 1

### Specialist evidence

Signatures authenticate the peer. Exact-quote validation checks citation presence, not truth or entailment. Review these results before acceptance.

Peer: 0x1cb499e8d9d4c8da5757f2b653c47754647ac66b · Capability: evidence-analysis

```json
{
  "inputDigest": "0x46641b90024eb2006758f5b04498caf00fc75b364a256e2c306e4e0784685b27",
  "analysis": {
    "kind": "deterministic-evidence-analysis",
    "missionDigest": "0x46641b90024eb2006758f5b04498caf00fc75b364a256e2c306e4e0784685b27",
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
      "kind": "resource-allocation",
      "inputDigest": "0xbe5d1a08e4b894f8e79311eac649f05bd0977a31b3611bd0720df6964c17294b",
      "summary": {
        "selectedIds": [
          "b",
          "c"
        ],
        "declaredNetMicroUsd": "80000000",
        "capitalMicroUsd": "100000000",
        "computeUnits": 8,
        "reviewMinutes": 16,
        "optimalWithinSuppliedCandidates": true,
        "examinedSubsets": 8
      },
      "rows": [
        {
          "id": "a",
          "benefitMicroUsd": "150000000",
          "costMicroUsd": "80000000",
          "riskReserveMicroUsd": "10000000",
          "computeUnits": 8,
          "reviewMinutes": 18,
          "selected": false,
          "declaredNetMicroUsd": "60000000"
        },
        {
          "id": "b",
          "benefitMicroUsd": "90000000",
          "costMicroUsd": "40000000",
          "riskReserveMicroUsd": "10000000",
          "computeUnits": 4,
          "reviewMinutes": 8,
          "selected": true,
          "declaredNetMicroUsd": "40000000"
        },
        {
          "id": "c",
          "benefitMicroUsd": "90000000",
          "costMicroUsd": "40000000",
          "riskReserveMicroUsd": "10000000",
          "computeUnits": 4,
          "reviewMinutes": 8,
          "selected": true,
          "declaredNetMicroUsd": "40000000"
        }
      ],
      "facts": [
        {
          "id": "selection",
          "text": "Selected feasible subset: b, c, with declared net 80000000 micro-USD. These benefits are supplied estimates, not realized returns."
        },
        {
          "id": "capacity",
          "text": "Selected capacity: 100000000 micro-USD capital, 8 compute units, 16 review minutes."
        },
        {
          "id": "search",
          "text": "All 8 subsets of the 3 supplied candidates were evaluated. Optimality applies only to this finite candidate set and its declared objective and constraints."
        }
      ],
      "limitation": "Exact finite optimization of owner-supplied estimates, not a forecast or execution authorization. At most 16 indivisible candidates; no scheduling, market access or external payments are implied."
    },
    "sources": [
      {
        "id": "work-input",
        "title": "Authorized work observation",
        "digest": "0x94ff37b1de0a081d9935205cfc2469ada66ac688009cc1ebf9b01f5f4d26ccc0",
        "url": null
      },
      {
        "id": "input-observation",
        "title": "Observation envelope",
        "digest": "0xade6e04aefa87c1bdc35264814619c371d2da36eddf4bd776519c92fa620137e",
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
