# AGI ALPHA NODES — Synthetic AI Labor & $AGIALPHA Token Economics

> _"Synthetic intelligence is productive capital. $AGIALPHA is the accounting system."
> — AGI King_

---

## Table of Contents

1. [Executive Snapshot](#executive-snapshot)
2. [Alpha Work Unit Definition](#alpha-work-unit-definition)
3. [$AGIALPHA Token Coupling](#agialpha-token-coupling)
4. [Node Runtime & Metering Loop](#node-runtime--metering-loop)
5. [Validator & Oracle Mechanics](#validator--oracle-mechanics)
6. [Financial Instrumentation](#financial-instrumentation)
7. [Governance Parameters & Levers](#governance-parameters--levers)
8. [Appendix](#appendix)

---

## Executive Snapshot

- **Synthetic Labor Primitive** — AGI ALPHA NODES mint verifiable
  synthetic labor units (**α‑WU**) backed by metered compute, service-level adherence,
  and validator scoring.
- **Settlement Token** — **$AGIALPHA** powers registration, settlement, and yield.
  Emission, redemption, and burn policies remain proportional to validated α‑WU output.
- **Economic Outcome** — Holding $AGIALPHA exposes allocators to aggregate AI
  productivity ("AI GDP") with transparent wage dynamics and validator-enforced
  quality assurance.
- **Implementation Posture** — Metering, oracle attestation, and validator processes
  are specified for on-chain deployment and off-chain auditability.

---

## Alpha Work Unit Definition

**Symbol:** α‑WU

Each node reports its realized workload in **α‑WU**, a dimensionless scalar that
represents validated synthetic AI labor hours:

\[
\alpha\text{-WU} = \mathrm{GPU}_s \times \mathrm{gflops}_{\mathrm{norm}} \times
\mathrm{ModelTier} \times \mathrm{SLO}_{\mathrm{pass}} \times \mathrm{QV}
\]

### α‑WU Parameters

- **GPUₛ** — Seconds of GPU compute consumed, metered through NVML, DCGM,
  or ROCm SMI.
  - **Range**: `> 0` seconds
  - **Governance Surface**: Node agent / firmware configuration
- **gflops_norm** — Normalized compute capacity, baseline `A100 = 1.0`
  with H100 and MI300 mapped relative.
  - **Range**: `> 0`
  - **Governance Surface**: On-chain SKU lookup table
- **ModelTier** — Difficulty multiplier per model class (`SMALL`, `BASE`, `FRONTIER`,
  `CUSTOM`, etc.).
  - **Range**: `(0, ∞)`
  - **Governance Surface**: On-chain tier registry
- **SLO_pass** — Service-level adherence built from latency and uptime scores.
  - **Range**: `[0, 1]`
  - **Governance Surface**: Validator aggregation weights
- **QV** — Quality validation score derived from validator audits.
  - **Range**: `[0, 1]`
  - **Governance Surface**: Validator committee policy

### Implementation Notes

- Maintain a canonical SKU → multiplier table on-chain with immutable audit logs.
- Allow governance to register new tiers only with attested benchmark artifacts.
- Compose `SLO_pass` from weighted latency and uptime metrics (for example `0.6`
  latency, `0.4` uptime).
- Aggregate validator scores via trimmed means or weighted medians for determinism.

---

## $AGIALPHA Token Coupling

**$AGIALPHA** acts as the unit of account for synthetic labor and the
settlement asset for the network.

- **Emission** — Nodes stake $AGIALPHA to register. Per epoch, emissions
  distribute in proportion to validated α‑WU output.
- **Redemption / Burn** — Jobs consume α‑WU priced in $AGIALPHA. A protocol-defined
  fraction burns on settlement, linking scarcity to productivity throughput.
- **α‑Productivity Index** — Aggregate synthetic labor per epoch:

  \[
  \mathrm{AlphaGDP}_t = \sum_{i \in \text{epoch } t} \alpha\text{-WU}_i
  \]

  Allocators and risk desks can query the metric as an "AI GDP" indicator.
- **Synthetic Wage Rate** — Wage equilibrium emerges from emissions versus output:

```solidity
function rewardPerAlphaWU(uint64 epoch) public view returns (uint256) {
    return epochEmission[epoch] / totalAlphaWU[epoch];
}
```

As productivity scales, the market-driven AI wage (`AGIALPHA/α‑WU`) self-adjusts
through emissions and burn schedules.

---

## Node Runtime & Metering Loop

Every AGI ALPHA NODE runs a hardened metering sidecar to generate continuous evidence.

### A. Metering & Evidence Capture

- Collect GPU metrics (`GPU_s`), identify `gflops_norm`, record `ModelTier`, and
  capture latency and uptime signals.
- Produce a reproducible **performance hash** (`perfHash`) from hardware IDs, driver
  versions, container digests, and workload signatures.

### B. Oracle Signing

- Construct a canonical `Usage` payload and sign with the node DID or EOA key.
- Append trusted execution proofs or remote attestations when available.

### C. Submission

- Submit usage data to the on-chain **WorkMeter** contract with `submitUsage`.
- Validators retrieve referenced artifacts (IPFS or HTTPS) to recompute SLO and QV
  metrics.

### D. Reward Settlement

- After finalization, call
  `claimReward(epoch)` to receive $AGIALPHA in proportion to validated α‑WU.
  Slashing applies for misreporting or downtime.

#### Usage Payload (Off-Chain JSON → On-Chain Hash)

```json
{
  "node": "0xNodeAddress",
  "epoch": 12345,
  "jobId": "0xJOB...",
  "gpuSeconds": 4321.5,
  "gflopsNorm": 1.00,
  "modelTier": "FRONTIER",
  "slo": {"latencyP50": 210, "latencySLO": 250, "uptime": 0.999, "sloPass": 0.98},
  "artifacts": ["ipfs://Qm..."],
  "perfHash": "0xabc...",
  "timestamp": 1712345678,
  "signature": "0xsig..."
}
```

#### Solidity Interface Sketch

```solidity
interface IWorkMeter {
    struct Usage {
        address node;
        uint64 epoch;
        bytes32 jobId;
        uint64 gpuSeconds;
        uint32 gflopsNorm_milli;   // 1000 = 1.0
        uint16 modelTier_bps;      // 10000 = 1.0
        uint16 sloPass_bps;        // 0..10000
        bytes32 perfHash;
        bytes   usageProof;        // signature or attestation bundle
        string  uri;               // IPFS or HTTPS manifest pointer
    }

    event UsageSubmitted(bytes32 indexed usageId, address indexed node, uint64 epoch);
    function submitUsage(Usage calldata u) external returns (bytes32 usageId);
}

interface IProductivityIndex {
    event AlphaWUAccrued(address indexed node, uint64 epoch, uint256 alphaWU);
    function totalAlphaWU(uint64 epoch) external view returns (uint256);
}

interface IEmissionManager {
    event EpochEmitted(uint64 indexed epoch, uint256 emission, uint256 wagePerAlphaWU);
    function epochEmission(uint64 epoch) external view returns (uint256);
    function rewardPerAlphaWU(uint64 epoch) external view returns (uint256);
    function claimReward(uint64 epoch) external;
}
```

---

## Validator & Oracle Mechanics

1. **Commit Phase** — Submit `keccak256(usageId, verdict, qvScore, salt)` commitments
   after recomputing SLO and QV metrics.
2. **Reveal Phase** — Reveal `(verdict, qvScore, salt)` to verify commitments
   and derive final `SLO_pass` before finalizing `QV` values.
3. **Finalization** — Write α‑WU credit to the `ProductivityIndex`
   and unlock reward claims for compliant nodes.
4. **Slashing & Incentives** — Apply governance-defined penalties
   for non-reveals or fraudulent scoring while compensating honest
   participation with validator fees.

Validators maintain reproducible audit trails via IPFS manifests referenced in each
`Usage` payload.

---

## Financial Instrumentation

- **Token Exposure** — Holding $AGIALPHA tracks network-wide productivity.
  Emissions, burns, and validator fees define token holder yield.
- **Synthetic Labor Yield (SLY)** — Publish and maintain the productivity yield metric:

  \[
  \mathrm{SLY}_t = \frac{\sum \alpha\text{-WU}_{\text{validated}, t}}
  {\mathrm{AGIALPHA}_{\mathrm{circulating}, t}}
  \]

  The ratio aligns $AGIALPHA with familiar yield instruments used by allocators.
- **Transparency Tooling** — Dashboards (subgraph plus IPFS) expose α‑WU
  production, burn rates, emission schedules, validator scores, and
  `rewardPerAlphaWU` history.
- **Staking Tranches** — Offer tiered staking options (`FRONTIER`, `BASE`,
  consumer) so allocators can target risk bands aligned with underlying model tiers.
- **Market Narrative** — Position $AGIALPHA as a programmable AI labor
  standard and an investable productivity curve.

---

## Governance Parameters & Levers

Governance keeps the system solvent, performant, and tamper-resistant by
managing the following parameters:

- **Normalization Table** — Maps each accelerator SKU to `gflops_norm` multipliers.
- **Model Tier Multipliers** — Applies output multipliers per model category.
- **SLO Weights & Thresholds** — Controls latency versus uptime weighting and minimum
  SLO requirements.
- **Validator Quorum** — Defines minimum stake, quorum, and rotation cadence.
- **Epoch Length** — Sets the accounting window for emissions and reward settlement.
- **Emission Schedule** — Configures the per-epoch $AGIALPHA emission curve.
- **Burn Rate** — Determines the settlement fee fraction routed to burns.
- **Slashing Ratios** — Establishes penalties for downtime, fraud, or collusion.

Governance actions must emit auditable events, update public registries,
and reference change manifests for compliance archives.

---

## Appendix

- **Evidence Retention** — Archive signed payloads, attestation logs, and manifests
  for a governance-defined number of epochs to support audits.
- **Data Provenance** — Source metrics from reproducible agents; deterministic hashing
  enables operators to replay calculations end to end.
- **Interoperability** — Design interfaces for L1 or rollup deployments, enabling
  oracles to bridge productivity indices across protocols.
- **Security Posture** — Enforce hardware fingerprints, DID key rotation, and optional
  TEEs to suppress spoofing and align with synthetic labor standards.

---

_This document defines the canonical economic blueprint for AGI ALPHA Nodes and the
$AGIALPHA productivity token. Updates require governance approval and must preserve
backwards-compatible audit trails._
