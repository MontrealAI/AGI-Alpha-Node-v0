# Guardian Rune · Post-Quantum Key Stewardship
<!-- markdownlint-disable MD013 -->

> Guardians sit at the perimeter of the treasury rail: they hold Dilithium keys,
> sign canonical digests, and unlock funds only when the owner commands it.

This rune is the custody handbook for Mode A guardians. Follow it to generate
Dilithium keys, register with the orchestrator, sign CBOR envelopes, rotate
credentials, and prove compliance to the owner without reverse-engineering the
runtime.

## Lifecycle overview

```mermaid
flowchart LR
  classDef neon fill:#0b1120,stroke:#22c55e,stroke-width:2px,color:#e2e8f0;
  classDef lava fill:#0b1120,stroke:#f97316,stroke-width:2px,color:#ffedd5;
  classDef frost fill:#0b1120,stroke:#0ea5e9,stroke-width:2px,color:#e0f2fe;

  Keygen[`npm run treasury:keygen`\nGuardian keypair]:::lava --> Vault[Offline vault or HSM]:::frost
  Vault --> Registry[`config/guardians.json`\n(on orchestrator)]:::neon
  Registry --> Digest[Owner issues digest]:::lava
  Digest --> Sign[`npm run treasury:sign`\nCBOR envelope]:::lava
  Sign --> Drop[Upload `.cbor` to orchestrator dropbox]:::neon
  Drop --> Aggregate[`aggregateGuardianEnvelopes`\nthreshold enforcement]:::frost
  Aggregate --> Execute[`npm run treasury:execute`\nAuthorized tx]:::neon
```

## Pre-flight checklist

1. Node.js ≥ 20.18.1 with `npm ci` already executed (ensures `dilithium-crystals-js`
   WASM is local).
2. A secure workstation (air-gapped if possible) for key generation.
3. Storage target for private keys: password manager, HSM, offline disk, or
   hardware enclave with 0600 permissions at minimum.
4. The `$AGIALPHA` contract anchor (`0xa61a3b3a130a9c20768eebf97e21515a6046a1fa`,
   18 decimals) bookmarked so you can independently verify treasury events.

## 1. Generate Dilithium key pairs

Use the built-in CLI instead of wiring your own WASM harness:

```bash
npm run treasury:keygen -- --guardian-id guardian-1 --out ./keys/guardian-1
```

Outputs:

- `./keys/guardian-1.pk` — Base64 public key (share with orchestrator).
- `./keys/guardian-1.sk` — Base64 private key (stay offline; default mode `0600`).
- `./keys/guardian-1.json` — Metadata stub containing `guardianId`, `parameterSet`,
  and the public key for fast onboarding.

### Advanced options

| Flag | Purpose |
| ---- | ------- |
| `--parameter-set <0-3>` | Choose Dilithium set (default `2`, NIST level 5). |
| `--seed 0x… or --seed @path` | Deterministic generation for HSM mirroring or disaster recovery. |
| `--json` | Emit a machine-readable summary (includes hex + base64 encodings). |
| `--stdout` | Skip file emission entirely (useful inside an HSM provisioning shell). |

> 🔐 **Reminder:** Never store the `.sk` file inside the repository. Copy it to an
> encrypted vault immediately and shred the working copy if you used a shared
> workstation.

## 2. Register with the orchestrator

1. Copy the JSON stub (or manually paste values) into `config/guardians.json`.

   ```jsonc
   [
     {
       "id": "guardian-1",
       "publicKey": "<base64 from guardian-1.pk>",
       "parameterSet": 2
     }
   ]
   ```

2. Share only the `.pk` (or the JSON stub) through the agreed secure channel.
   The orchestrator imports it via `GuardianRegistry.fromConfigFile` and refuses
   to count signatures from unknown or revoked guardians.
3. Keep a private audit note with: guardian id, parameter set, creation date,
   and storage location. You will need this when rotating keys.

## 3. Sign digests

Guardians never guess the hash: the orchestrator distributes either a full
`TreasuryIntentV1` JSON payload or the canonical digest. To sign:

```bash
npm run treasury:sign -- intents/payout.json \
  --private-key @keys/guardian-1.sk \
  --public-key @keys/guardian-1.pk \
  --guardian-id guardian-1 \
  --chain-id 11155111 \
  --contract 0xa61a3b3a130a9c20768eebf97e21515a6046a1fa \
  --out ./envelopes/guardian-1.cbor
```

- The CLI handles ABI encoding, domain binding, CBOR serialization, and metadata
  stamping.
- Every envelope embeds the guardian id and issued-at timestamp so the
  orchestrator can prove quorum provenance.

Once signed, upload the `.cbor` file to the agreed location (S3 bucket, SFTP,
Matrix room, etc.). The orchestrator uses `aggregateGuardianEnvelopes` to reject
unknown or duplicate guardians and only proceeds when the threshold is met.

## 4. Rotation & revocation

1. Regenerate a new key pair with `treasury:keygen` (optionally with
   `--seed` recorded in your custody ledger).
2. Update `config/guardians.json` with the new public key and set `revoked: true`
   on the previous entry so the orchestrator stops counting it immediately.
3. Notify the owner/operator so they can purge stale envelopes and request fresh
   signatures.
4. Destroy the old private key or move it into an escrow vault if contractual
   obligations require recovery.

## 5. Operational hardening

- **Storage:** Encrypt `.sk` files at rest, enforce MFA on password managers, and
  prefer offline/HSM custody for long-lived guardians.
- **Transport:** When sharing public keys or envelopes, use authenticated
  channels (Matrix with E2E, Signal, WireGuard). Never post them to email
  threads without encryption.
- **Attestation:** After the orchestrator executes an intent, cross-check the
  `IntentExecuted` event emitted by `TreasuryExecutor.sol` and reconcile it with
  the digest you signed.
- **CI parity:** Guardians can dry-run their envelopes locally by calling
  `npm run treasury:execute -- --dry-run` with the intent JSON and their envelope
  to confirm verification passes before the owner even asks.

## 6. Troubleshooting

| Symptom | Resolution |
| ------- | ---------- |
| `Guardian record must include id and publicKey` | Ensure `config/guardians.json` entry includes both fields and trims whitespace. |
| `Digest mismatch` during verification | Confirm you signed the digest distributed for this intent; domain hints (chain id, selector) must match the orchestrator configuration. |
| `Unknown guardian` in aggregator logs | The orchestrator does not recognize your public key—share the `.json` stub again or confirm your id matches. |
| Need reproducible key for DR tests | Use `--seed 0x<64 hex chars>` to regenerate an identical pair; store the seed offline. |

Keep this rune next to your custody ledger; it ensures the owner always retains
absolute command while delegating signature duties to guardians who can prove
process discipline.
