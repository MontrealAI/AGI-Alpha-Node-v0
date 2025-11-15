# ENS Identity and Node Attestation Framework  
_for AGI-Alpha-Node-v0 and AGI-Alpha-Agent-v0_

## 0. Status

- **Release Status:** Alpha
- **Version:** `v0.0.1`
- **Applies to:**
  - AGI Alpha Agents: `*.alpha.agent.agi.eth`
  - AGI Alpha Nodes: `*.alpha.node.agi.eth`
- **Scope:** Identity, discovery, attestation, and observability for AGI Alpha participants.

---

## 1. Goals & Non-Goals

### 1.1 Goals

This spec defines a production-grade framework to:

1. Give ENS subnames **durable, verifiable identities**.
2. Publish **cryptographic keys and metadata** via ENS resolver records.
3. Make agents and nodes **discoverable** over libp2p using `/dnsaddr`.
4. Provide **signed health attestations** bound to ENS identities.
5. Expose **OpenTelemetry spans** for fleet-wide observability using consistent field names.

### 1.2 Non-Goals

- This spec does **not** define employment, economics, or job-payout logic.
- This spec does **not** define on-chain smart contract ABIs beyond ENS/NameWrapper assumptions.

---

## 2. Terminology

- **AGI Alpha Agent**: A logical agent identity under `*.alpha.agent.agi.eth`.
- **AGI Alpha Node**: An infrastructure node identity under `*.alpha.node.agi.eth`.
- **Identity**: The tuple `(ENS name, ENS resolver records, DNS _dnsaddr, pubkey)`.
- **Attestation**: A signed JSON document emitted by the agent/node.
- **Health span**: An OpenTelemetry span representing a single health check.

---

## 3. Identity Namespace & Naming

### 3.1 ENS Naming Patterns

- **Agents**

  ```text
  <agent-label>.alpha.agent.agi.eth
  e.g. sentinel.alpha.agent.agi.eth
  ```

- **Nodes**

  ```text
  <node-label>.alpha.node.agi.eth
  e.g. node-01.alpha.node.agi.eth
  ```

### 3.2 Requirements

1. Each running agent/node MUST have **exactly one canonical ENS identity** in the appropriate subtree.
2. That ENS name MUST resolve to a resolver implementing:
   - `addr`, `text`, `contenthash` (standard ENS)
   - `pubkey` for secp256k1 (EIP-619 compatible)

---

## 4. ENS NameWrapper & Fuses

All AGI Alpha identities SHOULD be wrapped with ENS NameWrapper. For **sovereign**, “unruggable” identities, the following MUST be set:

### 4.1 Required Fuses

On the subname (`<label>.alpha.agent.agi.eth` or `<label>.alpha.node.agi.eth`):

- `PARENT_CANNOT_CONTROL = true`
- `CANNOT_UNWRAP = true`
- `CANNOT_TRANSFER = true`
- `CANNOT_SET_RESOLVER = true`

### 4.2 Expiry

- The NameWrapper expiry MUST be set in the future:
  - **MUST** be ≥ 1 year from deployment.
  - **SHOULD** be ≥ 5 years for long-lived production identities.
- Fuses remain enforced until the name expires. Rotation plans MUST treat the expiry as a **hard boundary**.

### 4.3 Validation Rules

Implementations SHOULD enforce:

- `expiry_unix` > current_time + minimal_grace_period.
- All four fuses above are `true` for “sovereign” identities.
- ENS name suffix:
  - Agents MUST end with `.alpha.agent.agi.eth`.
  - Nodes MUST end with `.alpha.node.agi.eth`.

---

## 5. ENS Resolver Records

### 5.1 Pubkey (EIP-619)

Each identity MUST expose a `pubkey()` record:

- `coinType = 1` (secp256k1)
- `x`: 32-byte big-endian
- `y`: 32-byte big-endian

This key is the **attestation key** used to sign health payloads and other control-plane messages.

**Validation rules:**

- `(x, y)` MUST represent a valid point on secp256k1.
- The key pair MUST be unique per identity.
- The key MUST NOT be reused for unrelated protocols that could compromise security.

---

### 5.2 Text Records (TXT)

The resolver MUST expose structured text records. Two styles are allowed:

- Simple `key=value` pairs.
- A single JSON blob under `agent.meta` or `node.meta`.

#### 5.2.1 Required Text Keys (Agents)

For `*.alpha.agent.agi.eth`:

| Key                 | Type   | Required | Allowed Values / Format                                   |
|---------------------|--------|----------|-----------------------------------------------------------|
| `role`              | string | MUST     | `agi-alpha-agent`                                         |
| `agent.version`     | string | MUST     | Semver or git-ish version (e.g. `alpha-factory-v1.2.3`)  |
| `agent.runtime`     | string | SHOULD   | Arbitrary runtime descriptor                              |
| `agent.did`         | string | SHOULD   | DID URI (e.g. `did:ethr:0x...`)                           |
| `agent.endpoint`    | string | SHOULD   | HTTPS or wss endpoint URI                                 |
| `agent.contenthash` | string | SHOULD   | IPFS/other contenthash URI                                |
| `agent.org`         | string | MAY      | Organizational tag (e.g. `agi.eth`)                       |
| `agent.policy-uri`  | string | MAY      | URI to policy/terms                                       |
| `agent.meta`        | JSON   | MAY      | JSON blob (see below)                                     |

Example `agent.meta` JSON (stored as a single TXT value):

```json
{
  "kind": "agi-alpha-agent",
  "version": "alpha-factory-v1.2.3",
  "did": "did:ethr:0x1234567890abcdef1234567890abcdef12345678",
  "endpoint": "https://sentinel.alpha.agent.agi.eth.limo",
  "contenthash": "ipfs://bafybeigdyrzt4eexampleagentcodecid"
}
```

#### 5.2.2 Required Text Keys (Nodes)

For `*.alpha.node.agi.eth`:

| Key             | Type   | Required | Allowed Values / Format                         |
|-----------------|--------|----------|-----------------------------------------------|
| `role`          | string | MUST     | `agi-alpha-node`                              |
| `node.version`  | string | MUST     | Node stack version                            |
| `node.runtime`  | string | SHOULD   | Runtime descriptor (e.g. `k8s-daemonset`)     |
| `node.cluster`  | string | SHOULD   | Cluster or network id (e.g. `agi-alpha-mainnet`) |
| `node.endpoint` | string | SHOULD   | HTTPS or wss endpoint URI                     |
| `node.meta`     | JSON   | MAY      | JSON blob                                     |

---

## 6. DNS Discovery via `/dnsaddr` (libp2p)

### 6.1 TXT Record Layout

For a given identity `NAME` (e.g. `sentinel.alpha.agent.agi.eth`):

- DNS label queried by clients:

  ```text
  _dnsaddr.NAME
  ```

- Each TXT record MUST start with `dnsaddr=` and the remainder MUST be a valid multiaddr.

Example (Agent):

```text
_dnsaddr.sentinel.alpha.agent.agi.eth.  IN TXT "dnsaddr=/ip4/203.0.113.42/tcp/4001/p2p/12D3KooWSentinelPeerIdXYZ123456789abcdef"
_dnsaddr.sentinel.alpha.agent.agi.eth.  IN TXT "dnsaddr=/ip6/2001:db8::1/tcp/4001/p2p/12D3KooWSentinelPeerIdXYZ123456789abcdef"
_dnsaddr.sentinel.alpha.agent.agi.eth.  IN TXT "dnsaddr=/ip4/203.0.113.42/tcp/443/ws/p2p/12D3KooWSentinelPeerIdXYZ123456789abcdef"
```

Example (Node):

```text
_dnsaddr.node-01.alpha.node.agi.eth. IN TXT "dnsaddr=/ip4/198.51.100.10/tcp/4001/p2p/12D3KooWNode01PeerIdabcdef1234567890"
_dnsaddr.node-01.alpha.node.agi.eth. IN TXT "dnsaddr=/ip4/198.51.100.10/tcp/443/ws/p2p/12D3KooWNode01PeerIdabcdef1234567890"
```

### 6.2 Multiaddr Requirements

Each `dnsaddr` multiaddr:

- MUST contain a `/p2p/<peerId>` segment.
- SHOULD include at least one reachable transport (`/tcp`, `/ws`, `/quic`, etc.).
- MAY include multiple multiaddrs for the same peer or multiple peers.

### 6.3 Validation Rules

At minimum:

- There MUST be at least one TXT record with prefix `dnsaddr=`.
- Each `dnsaddr=` value MUST parse as a multiaddr.
- All `/p2p/` peer IDs within `_dnsaddr.NAME` SHOULD match the advertised `peer_id` in the health attestation for that identity.

---

## 7. Health Attestation Payload

Agents and nodes periodically emit **signed JSON** health attestations.

### 7.1 Top-Level Structure

```json
{
  "schema": "agi-alpha/health-attestation-v1",
  "ens": "sentinel.alpha.agent.agi.eth",
  "peer_id": "12D3KooWSentinelPeerIdXYZ123456789abcdef",
  "multiaddrs": [
    "/ip4/203.0.113.42/tcp/4001/p2p/12D3KooWSentinelPeerIdXYZ123456789abcdef",
    "/ip6/2001:db8::1/tcp/4001/p2p/12D3KooWSentinelPeerIdXYZ123456789abcdef",
    "/ip4/203.0.113.42/tcp/443/ws/p2p/12D3KooWSentinelPeerIdXYZ123456789abcdef"
  ],
  "agent_version": "alpha-factory-v1.2.3",
  "node_version": "node-stack-v0.9.0",
  "role": "agi-alpha-agent",
  "runtime": "meta-agentic-alpha",
  "cluster": "agi-alpha-mainnet",
  "ens_fuses": {
    "parent_cannot_control": true,
    "cannot_unwrap": true,
    "cannot_transfer": true,
    "cannot_set_resolver": true,
    "expiry_unix": 2072707200
  },
  "timestamp": "2025-11-15T15:04:05Z",
  "status": "healthy",
  "metrics": {
    "uptime_s": 86400,
    "cpu_load": 0.23,
    "mem_used_mb": 512
  }
}
```

### 7.2 Field Definitions & Constraints

#### 7.2.1 Common Fields

| Field        | Type     | Required | Description / Constraints                                      |
|-------------|----------|----------|----------------------------------------------------------------|
| `schema`    | string   | MUST     | MUST be `agi-alpha/health-attestation-v1`                      |
| `ens`       | string   | MUST     | MUST be a valid ENS name in the appropriate subtree           |
| `peer_id`   | string   | MUST     | libp2p peer id (base58/base36); non-empty                      |
| `multiaddrs`| string[] | MUST     | At least one; each MUST be a valid multiaddr incl. `/p2p/`    |
| `role`      | string   | MUST     | `agi-alpha-agent` or `agi-alpha-node`                         |
| `runtime`   | string   | SHOULD   | Free-form runtime descriptor                                  |
| `timestamp` | string   | MUST     | RFC3339 UTC (`YYYY-MM-DDThh:mm:ssZ`)                          |
| `status`    | string   | MUST     | One of: `healthy`, `degraded`, `down`                         |
| `metrics`   | object   | MAY      | Arbitrary numeric metrics; see recommended keys below         |

#### 7.2.2 Agent-Specific

| Field           | Type   | Required | Description                             |
|----------------|--------|----------|-----------------------------------------|
| `agent_version`| string | MUST     | MUST match or be compatible with `agent.version` TXT |
| `cluster`      | string | MAY      | Optional cluster tag if applicable      |

#### 7.2.3 Node-Specific

| Field           | Type   | Required | Description                             |
|----------------|--------|----------|-----------------------------------------|
| `node_version` | string | MUST     | MUST match or be compatible with `node.version` TXT |
| `cluster`      | string | SHOULD   | MUST be set for production nodes        |

#### 7.2.4 `ens_fuses` Block

| Field                    | Type  | Required | Description                                |
|--------------------------|-------|----------|--------------------------------------------|
| `parent_cannot_control`  | bool  | MUST     | SHOULD be `true` for sovereign identities  |
| `cannot_unwrap`          | bool  | MUST     | SHOULD be `true` for sovereign identities  |
| `cannot_transfer`        | bool  | MUST     | SHOULD be `true` for sovereign identities  |
| `cannot_set_resolver`    | bool  | MUST     | SHOULD be `true` for sovereign identities  |
| `expiry_unix`            | int64 | MUST     | NameWrapper expiry (Unix seconds, UTC)     |

Implementations SHOULD cross-check `ens_fuses` with on-chain NameWrapper data.

#### 7.2.5 Recommended Metrics

Under `metrics`:

| Key            | Type   | Meaning                            |
|----------------|--------|------------------------------------|
| `uptime_s`     | int64  | Uptime in seconds                  |
| `cpu_load`     | float  | Normalized CPU load (0–1 or >1)    |
| `mem_used_mb`  | int64  | Memory used in MB                  |

Implementations MAY add more metrics but SHOULD avoid name collisions with other structured prefixes (`agent.`, `node.`, `ens.`, `health.`) used in spans.

---

## 8. Attestation Signature

The above payload is wrapped and signed:

```json
{
  "payload": { /* health payload */ },
  "signature": {
    "alg": "secp256k1-keccak256",
    "sig": "0xabcdef0123deadbeefcafebabe...",
    "pubkey_x": "0x69e44ac3a9d52dd5b1932cf71c9e78380ef55b18c1cebdc782c2c91f5fab1234",
    "pubkey_y": "0x1d4f119610eec3be1a4fb29bca55d2b1e8950cd4e4c8f6a6c5b4587103cdef01"
  }
}
```

### 8.1 Algorithm

- **Hash:** `keccak256(payload_canonical_bytes)`
- **Signature:** ECDSA over secp256k1
- **Canonicalization:** JSON MUST be canonicalized before hashing:
  - Stable key ordering
  - UTF-8 encoding
  - No trailing commas

### 8.2 Validation Rules

Verifiers MUST:

1. Resolve `ens` to its resolver and load `pubkey()` `(x, y)`.
2. Check `pubkey_x`/`pubkey_y` in the signature match the ENS `pubkey()`.
3. Compute `keccak256` over the canonical payload.
4. Verify ECDSA(secp256k1) using `(x, y)` and `sig`.
5. Reject attestations with:
   - Invalid signature
   - Mismatched `ens` suffix (`.alpha.agent.agi.eth` vs `.alpha.node.agi.eth`)
   - Grossly skewed `timestamp` (e.g. older than configurable horizon).

---

## 9. OpenTelemetry Mapping

Each health attestation SHOULD be mirrored as an OpenTelemetry span.

### 9.1 Span Shape

- **Name:** `agi.healthcheck` (RECOMMENDED)
- **Kind:** `INTERNAL`
- **One span per health check**

### 9.2 Common Attributes

| Attribute Key                      | Value Source                        |
|------------------------------------|-------------------------------------|
| `agent.ens` / `node.ens`           | `payload.ens`                       |
| `agent.peer_id` / `node.peer_id`   | `payload.peer_id`                   |
| `agent.role` / `node.role`         | `payload.role`                      |
| `agent.version` / `node.version`   | `agent_version` / `node_version`    |
| `agent.runtime` / `node.runtime`   | `runtime`                           |
| `node.cluster`                     | `cluster` (nodes)                   |
| `ens.fuses.parent_cannot_control`  | `ens_fuses.parent_cannot_control`   |
| `ens.fuses.cannot_unwrap`          | `ens_fuses.cannot_unwrap`           |
| `ens.fuses.cannot_transfer`        | `ens_fuses.cannot_transfer`         |
| `ens.fuses.cannot_set_resolver`    | `ens_fuses.cannot_set_resolver`     |
| `ens.expiry_unix`                  | `ens_fuses.expiry_unix`             |
| `dnsaddr.present`                  | Boolean; at least one `dnsaddr=` TXT found |
| `health.status`                    | `status`                            |
| `health.uptime_s`                  | `metrics.uptime_s`                  |
| `health.cpu_load`                  | `metrics.cpu_load`                  |
| `health.mem_used_mb`              | `metrics.mem_used_mb`               |

### 9.3 Events

The raw attestation MAY be attached as an event:

- **Event name:** `agi.health-attestation`
- **Attributes:**
  - `attestation.json`: the full attestation JSON string

---

## 10. Reserved Field Names & Validation Summary

### 10.1 Reserved JSON Fields

The following JSON fields are reserved for this spec and MUST NOT be repurposed:

- Top-level:  
  `schema`, `ens`, `peer_id`, `multiaddrs`, `agent_version`, `node_version`, `role`, `runtime`, `cluster`, `ens_fuses`, `timestamp`, `status`, `metrics`
- Inside `ens_fuses`:  
  `parent_cannot_control`, `cannot_unwrap`, `cannot_transfer`, `cannot_set_resolver`, `expiry_unix`
- Inside `metrics`:  
  `uptime_s`, `cpu_load`, `mem_used_mb` (can be extended, but meanings MUST remain)

### 10.2 Reserved OTel Attribute Prefixes

The following attribute name prefixes are reserved and MUST keep their semantics:

- `agent.*`
- `node.*`
- `ens.*`
- `health.*`
- `dnsaddr.*`

Implementations MAY add custom attributes under other prefixes, but SHOULD avoid creating new top-level prefixes that conflict with these.

### 10.3 Minimal Conformance Checklist

A node/agent implementation is **conformant** if:

1. ENS name follows the correct subtree pattern.
2. NameWrapper fuses and expiry meet Section 4 rules.
3. Resolver exposes a valid secp256k1 `pubkey()`.
4. Resolver exposes required text records for its role.
5. `_dnsaddr.<name>` TXT records publish at least one valid libp2p multiaddr.
6. Health attestation payload conforms to Section 7 and is signed as in Section 8.
7. OpenTelemetry spans, if exported, follow the attribute mapping in Section 9.

---

## 11. Future Extensions

Future versions MAY:

- Add additional reserved metrics names.
- Introduce new schemas (e.g., `agi-alpha/health-attestation-v2`) with backward-compatible fields.
- Define separate attestation types (e.g., configuration snapshot, policy compliance).

Implementations SHOULD treat unknown fields as **non-fatal** and ignore them safely.

---
