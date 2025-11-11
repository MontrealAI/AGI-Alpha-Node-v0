# AGI ALPHA NODES — Synthetic AI Labor & $AGIALPHA Token Economics

**TL;DR**: **AGI ALPHA NODES** continuously mint **verifiable synthetic labor units** (*α‑Work Units*, **α‑WU**). **$AGIALPHA** is the **settlement & yield token** that represents network‑wide **AI productivity**—a *computational‑productivity token* that macro funds can model as a **synthetic labor derivative**.

---

## 1) Core Economic Mapping

Each node reports its realized workload in **α‑WU**, defined as:

\[
\alpha\text{-WU} = \mathrm{GPU}_s \times \mathrm{gflops}_{\mathrm{norm}} \times \mathrm{ModelTier} \times \mathrm{SLO}_{\mathrm{pass}} \times \mathrm{QV}
\]

Where:

- **GPUₛ** — seconds of GPU compute actually consumed (metered).
- **gflops_norm** — normalized compute capacity, **A100 = 1.0** baseline (governance‑set mapping).
- **ModelTier** — difficulty/value multiplier for model class (e.g., *small*=0.8, *base*=1.0, *frontier*≥1.3; governance‑set).
- **SLO_pass** — latency/uptime adherence in [0,1] (SLO score).
- **QV** — quality‑validation score in [0,1] from peer validator audits.

This product is a **dimensionless scalar** expressing *verified synthetic labor hours* (AI labor).

### Implementation notes
- **Normalization table** (governance parameter): maps accelerator SKU → relative performance (e.g., A100=1.0, H100≈x.x, MI300≈x.x). Values live on‑chain for auditability.
- **Model tiers** are enumerated (e.g., `SMALL`, `BASE`, `FRONTIER`, `CUSTOM`) with multipliers set via governance.
- **SLO_pass** may combine latency and uptime using a weighted score (e.g., `wL*latency_pass + wU*uptime_pass`), both in [0,1].
- **QV** is an aggregate of validator scores (trimmed mean or median; see §3 validators).

---

## 2) Token Coupling ($AGIALPHA ↔ α‑WU)

**$AGIALPHA** acts as **work‑credit** and **settlement** token.

- **Emission**: Nodes **stake** $AGIALPHA to register. Per **epoch**, new $AGIALPHA is **distributed ∝ validated α‑WU**.
- **Redemption / Burn**: Jobs consume α‑WU **priced in $AGIALPHA**. On settlement, a protocol fraction is **burned**, linking **scarcity** to **productivity**.
- **Indexing**: Define an **α‑Productivity Index** per epoch:
  \[ \mathrm{AlphaGDP}_t = \sum \alpha\text{-WU}_i \ \text{in epoch } t \]
  Its growth tracks network “**AI GDP**”. Allocators can hold $AGIALPHA as exposure to this productivity curve.

**Epoch wage rate** (synthetic wage) is determined by emissions vs. output:

```solidity
function rewardPerAlphaWU() public view returns (uint256) {
    return epochEmission / totalAlphaWU; // AGIALPHA per α‑WU
}
```

As network productivity rises, the “AI wage” (**AGIALPHA/α‑WU**) **equilibrates** endogenously.

---

## 3) Node Implementation Loop

Each **AGI ALPHA NODE** runs a **metering sidecar** daemon.

**A. Metering**
- Collect GPU metrics (NVML/DCGM or ROCm SMI), model tier, job id, latency/uptime.
- Produce `GPU_s`, `gflops_norm`, `ModelTier`, raw SLO signals.
- Compute a **performance hash** (hardware+driver+image digest) for audit.

**B. Oracle Signing**
- Build a `Usage` struct, **sign with node DID key**.
- Optionally include **TEE/attestation** proofs (if available).

**C. Submission**
- `submitUsage(Usage u)` → L1/L2 contract (**WorkMeter**).
- Validators pull artifacts, recompute SLO/QV, and **commit–reveal** votes.

**D. Reward Claim**
- After finalization, node calls `claimReward(epoch)` to receive $AGIALPHA ∝ validated α‑WU.

### Usage struct (off‑chain JSON → on‑chain hash)
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

### Solidity interfaces (sketch)
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
        bytes   usageProof;        // sig / attestation
        string  uri;               // IPFS/HTTPS manifest
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

### Validator flow (commit–reveal)
1. **Commit** `keccak(usageId, verdict, qvScore, salt)`
2. **Reveal** `(verdict, qvScore, salt)` → contract checks commitment; aggregates **QV** and **SLO_pass**.
3. **Finalize** → write **α‑WU** to `ProductivityIndex`; enable **claimReward**.
4. **Slash** on non‑reveal or fraudulent scoring (governance parameters).

---

## 4) Financial Framing

To allocators, **$AGIALPHA** behaves like a **derivative** on **aggregate AI labor**:

- **Holding the token** = exposure to **network‑wide productivity**.
- **Yield** = emissions + fee‑funded burns − slashing.
- **Risk** = hardware downtime, validator penalties, governance changes.

Define and publish **Synthetic Labor Yield (SLY)**:

\[
\mathrm{SLY}_t = \frac{\sum \alpha\text{-WU validated in } t}{\mathrm{AGIALPHA}_{\mathrm{circulating}, t}}
\]

This becomes a standardized metric akin to a protocol‑level productivity yield.

---

## 5) Governance & Market Optics

- **Transparency dashboards** (on IPFS + subgraph):
  - α‑WU/time, burn rate, emission rate, validator scores, wagePerAlphaWU.
- **Tiered staking tranches** (e.g., *frontier* vs *consumer*) so allocators can choose exposure bands.
- **Narrative**: “**$AGIALPHA = the world’s first AI‑labor standard**.”
- **Parameters** (governance‑set):
  - normalization table, model‑tier multipliers, SLO weights, validator quorum, epoch length, emission schedule, burn rate, slashing ratios.

---

## 6) Minimal Technical Stack

**Smart contracts**
- `NodeRegistry` — stake, registration, ENS/DID binding, slashing hooks.
- `WorkMeter` — usage submissions, commit–reveal validation, α‑WU computation.
- `ProductivityIndex` — per‑epoch α‑WU totals (AI GDP).
- `EmissionManager` — epoch emission, wage rate, reward claims, fee burns.

**Off‑chain services**
- **Oracle aggregator** — pulls sidecar reports, forwards to chain if needed.
- **Validator network** — stateless containers performing SLO/QV checks, commit–reveal.
- **Sidecar** — metering (NVML/DCGM/ROCm), signing, retries, artifact upload (IPFS).

**Analytics**
- Subgraph indexing: `totalAlphaWU(epoch)`, `wagePerAlphaWU(epoch)`, node rankings.
- IPFS‑hosted dashboard plotting α‑WU vs epoch, emissions, burns, validator health.

---

## Economic Rationale (Concise)

1. **AI as Labor Force** — Compute + model capacity is a new labor factor. **α‑WU** makes productivity **fungible, auditable, tradable**.
2. **Synthetic Wage Curve** — `rewardPerAlphaWU = epochEmission / Σα‑WU`. As productivity rises, the marginal AI‑wage equilibrates.
3. **Intrinsic Yield** — Rewards are tied to validated output and fee‑funded burns; aggregate yield reflects **real efficiency**, not speculation.
4. **Macro Exposure** — $AGIALPHA ≈ perpetual derivative on **AI labor productivity** (protocol = AI GDP tracker).

### Simple valuation sketch
| Variable | Definition |
|---|---|
| **Pₐ (α‑WU Price)** | Fee per α‑WU (protocol index) |
| **Rₙ (Node Revenue)** | `α‑WUₙ × Pₐ × NodeShare` |
| **Eₜ (Epoch Emission)** | `f(Σ α‑WU, inflation, burn)` |
| **Yield to Staker** | `(Eₜ + FeeFlows − Burns) / Staked $AGIALPHA` |
| **Network Valuation** | `Σ PV(expected α‑WU × Pₐ)` discounted by **r** (validator+governance risk) |

---

## Appendix A — Example Governance Defaults *(illustrative)*
- Epoch length: **1 day**.
- Emission schedule: geometric decay **1.5% / 90 days**.
- Burn: **5%** of job fees.
- Validator quorum: **N=5**, majority > **60%** to pass.
- Slashing: **2%** non‑reveal, **10%** proven fraud.
- SLO weights: latency **60%**, uptime **40%**.
- Model tiers: `SMALL=0.8`, `BASE=1.0`, `FRONTIER=1.3`.

> These values are placeholders for testnets; mainnet parameters are set via governance and published on‑chain.

---

## Appendix B — Events (telemetry surface)
```solidity
event NodeRegistered(address indexed node, string ens, uint256 stake);
event UsageSubmitted(bytes32 indexed usageId, address indexed node, uint64 epoch);
event ValidationCommitted(bytes32 indexed usageId, address indexed validator);
event ValidationRevealed(bytes32 indexed usageId, address indexed validator, bool accept, uint16 qvBps);
event AlphaWUAccrued(address indexed node, uint64 epoch, uint256 alphaWU);
event EpochEmitted(uint64 indexed epoch, uint256 emission, uint256 wagePerAlphaWU);
event RewardClaimed(address indexed node, uint64 epoch, uint256 amount);
event FeeBurned(uint64 indexed epoch, uint256 amount);
```

---

## Appendix C — Sidecar CLI (reference)
```bash
agialpha-sidecar meter --job 0xJOB --tier FRONTIER \
  --artifacts ipfs://Qm... --submit --sign-with $NODE_KEY
```

---

**Positioning**: *“$AGIALPHA provides programmable exposure to verified AI‑labor productivity — a yield‑bearing synthetic labor derivative.”*

**Outcome**: A coherent asset class bridging **computational infrastructure**, **AI productivity**, and **tokenized capital markets**.
