# Alpha Node backup and recovery

<!-- markdownlint-disable MD013 -->

## Backup

Pause the node, stop its worker, and verify `npm run alpha -- status`. Back up the entire private node directory (`config.json`, `state.json`, `identity.key.json`, and `PAUSED` if present) to encrypted storage. Keep the latest reported ledger head separately in a trusted location. Never publish this directory or add it to Git.

The ledger detects changed entries, broken chains, invalid signatures, duplicate mission IDs and invalid reviews. It cannot detect deletion of the complete tail without comparison to a previously trusted head. The separate head checkpoint is therefore essential.

## Restore

1. Install the same release on a supported Node.js runtime.
2. Restore the private directory with owner-only directory access and `0600` file permissions.
3. Run `npm run alpha -- --home /restored/private/node status` and compare its head with your checkpoint.
4. Run `doctor`; in live mode this rechecks ENS and the token.
5. Inspect pending escrow obligations and receipts independently before generating or signing any transaction again.
6. Resume only after these checks succeed.

Do not initialize over a restored node. Lost signing keys cannot be recovered from an evidence export. If a key is compromised, pause, protect the host, rotate ENS routing and establish a new node identity; existing escrow obligations retain their originally funded recipient/reviewer.

## Interrupted writes

Writes use an exclusive `writer.lock`, a temporary file, file synchronization, atomic rename, and directory synchronization. A process crash can leave a lock or temporary file. The runtime refuses another writer while that lock exists.

Stop all workers and verify that no node process is active. Copy the directory for diagnosis. Verify the committed `state.json` with `status`. Only then remove `writer.lock` and any orphaned `*.tmp` files in this private directory, and retry. Never remove a lock held by a running process. Do not manually splice or edit signed events.

If initialization was interrupted before `config.json` was committed, preserve the partial directory and initialize a different empty directory. Do not reuse an accidentally orphaned key for funded work.

## Failure behavior

| Failure | Result and recovery |
| --- | --- |
| Missing or mismatched ENS | New live work fails; fix routing or credentials and rerun doctor |
| Provider outage, timeout, oversized or truncated output | No signed success is committed; inspect provider billing before retry |
| Paused during inference | A pause observed before commit rejects the result; an already committed result remains valid |
| Invalid source references or policy numbers | Mission rejected before inference |
| Duplicate mission ID with different inputs | Rejected; issue a new mission ID |
| Invalid or stale detached review | Rejected; re-export current evidence and obtain a new signature |
| Expired, unaccepted escrow | Anyone can trigger refund to the original funder |
| Accepted escrow while paused or expired | Claim remains payable to the originally funded node |
| Corrupt or shortened ledger | Restore a verified backup and compare the trusted head |

The local ledger has a 32 MB limit. Archive completed nodes and create a new identity/directory before reaching it; this release is a single-writer node, not a high-volume distributed database.

## v3 encrypted backup and restore

Pause the node and stop all workers/services, including specialists. Set `ALPHA_BACKUP_PASSWORD` through a protected environment to a strong secret of at least 16 characters; retain it separately from the encrypted archive.

```bash
npm run alpha -- --home /absolute/private/node pause
npm run alpha -- --home /absolute/private/node backup /absolute/backup/node-backup.json
npm run alpha -- --home /absolute/private/restored-node restore /absolute/backup/node-backup.json
```

Restore requires a new destination. It authenticates the AES-256-GCM/scrypt archive, validates paths/content hashes, verifies the signed ledger and always leaves the restored node paused. Compare its head with your external checkpoint. The backup includes private identity, configuration, action backups and raw signed transaction intents; the public evidence export does not replace it. Maximum plaintext backup size is 64 MiB/4096 files. Archive deliverables separately before reaching capacity.

Restoring an old backup does not undo external file changes or blockchain transactions. Keep the original directory quarantined, inspect later receipts and retain later evidence. Never run both restored and original nodes with the same signer. Backups cannot recover a forgotten password or lost key.

## v3 interrupted operations

Stop every worker and service before removing a verified stale lock. Locks include `writer.lock`, `pipeline.lock`, `engine.lock`, `action.lock` and `transaction.lock`; do not remove an active lock. A process ID is a diagnostic aid, not proof that an identically numbered current process owns a stale lock. Preserve a copy and verify committed state first.

| Interrupted phase | Recovery |
| --- | --- |
| Inference or specialist admission reservation | Inspect possible provider billing and peer receipts. Use `operations`, then the paused `recover-reservation CYCLE_HASH` command to close an unresolved reservation conservatively. It remains charged and is not retried as new work |
| Action prepared, target unchanged | Preserve the private action backup, restore the original reviewed owner configuration and rerun `operate` after inspection/resume |
| Action written, completion record absent | The executor compares before/after hashes, checks health and records completion or rollback without applying a new unrelated change |
| Action health failed | Original bytes are restored, result becomes terminal and the runtime pauses. Fix the service; a fresh observation and new reviewed mission are required |
| Target differs from both hashes | Do not overwrite an external edit. Reconcile the actual service manually and obtain a new reviewed plan |
| Signed transaction prepared or broadcast response lost | Keep its raw intent private. Retry the same `settle MISSION_ID`/`operate` to query both endpoints and rebroadcast the identical signed bytes if needed. Do not delete the intent or allocate a new nonce |
| Pending transaction or fee too low | Wait or use an explicit owner recovery procedure with both RPCs and a trusted wallet. Automatic fee replacement/cancellation is deliberately absent; do not concurrently use the dedicated signer |
| RPC disagreement, bytecode change or noncanonical receipt | Pause, investigate both operators/deployment records, and resume only after consistency is independently established |
| Transaction reverted | The recorded step is terminal. Diagnose contract state/funding/deadline and preserve the evidence. A new mission/funding flow may be required; never rewrite the signed journal to retry |
| Owner policy changed with an unresolved transaction | Restore the exact previously authorized policy to reconcile it, or handle the existing transaction explicitly. A new policy cannot rebind persisted transaction data |

An already broadcast transaction can mine while the node is paused or offline. Backups and pause do not revoke signatures. If keys are compromised, reconcile existing escrow obligations and rotate identity using the owner’s separate recovery process.

## Upgrade and rollback

Stop v2 workers, retain code/version/lockfile, record the trusted head, and back up the complete private directory before using v3. Existing schema-2 v2 records remain readable; new runtime records require v3. Once v3 has written them, older binaries cannot read the expanded event vocabulary. Rollback therefore needs the matching pre-upgrade directory plus reconciliation of every later external action/transaction. Preserve newer evidence; never silently discard obligations.

The default `npm start`, `agi-alpha-node` executable and Docker entrypoint now use the standalone node. Legacy users must choose `npm run legacy`, `agi-alpha-infrastructure` or `deploy/docker/Dockerfile.legacy` explicitly. New review-relay contract logic requires a new verified deployment; no proxy upgrade is assumed.

## v3.1 migration and specialist recovery

Stop all workers, pause, take an encrypted backup and retain the external trusted ledger head before upgrading. v3.1 still reads older evidence. New schema-2 runtime reports and v2 measured outcomes require v3.1 readers; downgrade only with the matching pre-upgrade state and reconciled obligations. Existing unversioned outcomes remain visible but no longer affect learning.

A `specialist.lock` blocks concurrent processes. After an interruption, stop the owning process and inspect the corresponding `specialist:*:reserved` and `:result` records. A completed result can be replayed. A reservation without a result cannot be retried automatically, even after a lock is cleared: reconcile any provider billing before explicitly authorizing a new mission. Never delete reservations to recover budget. Provider limits must also be configured at the provider.

Changes to source, dependency lockfiles, node configuration, pipeline, engine or qualification policy invalidate the corresponding external assurance scope. Recompute fingerprints and obtain current signed assessments. Restored nodes stay paused; verify paths, identity, ledger head and external transactions before resuming.

### v3.1 expense and reviewer compatibility

v3.1 writes failed-attempt expense events and v2 measured outcomes. Prior executables cannot interpret those records. Retain the pre-upgrade backup for rollback and reconcile any later work first. Preserve the configured reviewer identity: new run signatures bind the node's reviewer choice, so silently replacing that address invalidates history. Use a separately commissioned node and retained archives when changing review authority; in-place key rotation is not implemented.

Use `operations` and the [failure accounting procedure](alpha-qualification.md#account-for-failures-and-missing-measurements) after resolving interrupted work. Do not delete reservations to reclaim budgets. A signed expense closes an uncommitted failed mission permanently; start a new mission for a deliberate retry.

### v3.2 work results and review reservations

Stop workers and retain a complete encrypted backup and external trusted ledger-head checkpoint before upgrading. Existing schema-2 history remains readable. Structured work fields and computed-fact briefs require v3.2 to verify; older executables cannot read those new missions. Rollback requires the pre-upgrade state and reconciliation of any subsequent external work.

New operation reservations include reviewer minutes. Existing reservations and manual pending missions use a 15-minute compatibility estimate. Review the explicit time limits before resuming a previously configured pipeline. Daily reservations remain charged after failure or review; do not delete them to reclaim budget. Rejected outcomes now influence learning, so a previously selected plan may abstain on a fresh observation. Previously signed plans and reviews retain their exact input/action binding.

Structured exports can be regenerated from a verified journal. `verify-bundle --work-dir` recomputes the signed result and verifies both JSON and CSV. Restore demonstrations in v3.2 include all three work families, their peer receipts and review records, and resume in a paused state.
