# Local database recovery

The API uses the configured `DATABASE_FILE`, defaulting to `data/goxfinance_web.sqlite`. Snapshots are kept in the adjacent `backups/` directory, excluded from Git. They contain account password hashes, household records, and financial data. With `DATABASE_ENCRYPTION=encrypted`, the database and newly created recovery snapshots remain encrypted under the configured key; wrong keys fail closed. Explicit plaintext development mode produces plaintext snapshots. Older plaintext backups are not automatically encrypted or deleted. Protect all data directories with OS access controls. No backup download/upload or arbitrary filesystem-path API exists. See [database encryption](database-encryption.md) for key and mode boundaries.

## Create a snapshot

1. Sign in as Owner and open Household → Database recovery.
2. Select Create backup. Wait for the verified-success notification.
3. The new timestamp appears in the list. The API uses SQLite `VACUUM INTO` so committed WAL pages are included, then checks integrity, foreign keys, and known schema migrations.

Because a snapshot covers the entire database, the backend requires that this user owns every household and that every other account belongs to one of those households. An Owner of only one household in a shared database cannot back up or restore other people’s data. Such deployments need an operator-managed recovery procedure outside this UI.

## Restore a snapshot

1. Choose the timestamp and select Restore. Review that this replaces **all** users, households, and financial records.
2. Type `RESTORE DATABASE` and choose Queue restore. The API rechecks permissions, snapshot integrity, and schema compatibility, then pauses state-changing API requests.
3. Stop the API normally, then restart using the Windows GoXFinance launcher with the same configured database and encryption mode. Encrypted mode unlocks using its local prompt or configured backend environment passphrase. Run only one API process for this database. The runtime lease refuses a second live API process. `npm run dev` is suitable for explicit plaintext development, not the interactive encrypted unlock workflow.
4. Before opening the app database, the server creates and verifies a recovery snapshot of its current state. Plaintext mode uses SQLite’s backup API. Encrypted mode uses the verified encrypted copy and resumable restore protocol described in the encryption guide; it never falls back to plaintext. The server verifies the result, clears saved sessions, and applies any additive migrations.
5. Sign in again with an account and password present in the selected snapshot. Verify the expected household and account histories.

The recovery snapshot appears in the backup list after sign-in when ownership permits. It can be restored using the same confirmation process to undo the restore. If startup rejects a corrupt/incompatible snapshot, it fails without opening the website for writes. Retain the current database and all backup files; do not replace a live `.sqlite` file or delete WAL/SHM files by hand. Inspect the local server error and seek operator assistance. Backups from a future/unknown migration sequence are rejected. Known LF/CRLF variants and the released legacy mixed-line-ending 0004 fingerprint are supported.

## Verification and limits

Automated tests exercise snapshots of WAL-mode temporary databases, integrity/schema rejection, Owner restrictions, explicit confirmation, write suspension, restart, session invalidation, and recovery-snapshot retention. No test restores the real development database. Physical disk failure, process termination in the middle of restore, remote deployment, and external tools opening the same database are not certified by this test suite. Stop external SQLite editors before restoring. The runtime lease governs this application’s server processes only.
