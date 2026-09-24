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
