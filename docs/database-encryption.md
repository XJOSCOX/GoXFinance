# Database encryption at rest

## Current status and compatibility

Encryption is implemented **as an opt-in mode**. The existing live database, its WAL/SHM files, existing plaintext backups, and local `.env` have not been converted or removed. Existing installations continue using their configured plaintext database until a separately authorized cutover. Installing this change does not encrypt existing data by itself.

Selected driver: **`better-sqlite3-multiple-ciphers` 13.0.3**, pinned exactly in the lockfile. Its packaged engine is **SQLite3 Multiple Ciphers 2.4.0 / SQLite 3.53.4**. It exposes the synchronous interface required by the repositories and Drizzle's better-sqlite3 adapter. Ordinary better-sqlite3 is retained for explicit legacy plaintext mode; it is never tried as an encrypted-mode fallback.

This is **not Zetetic's official SQLCipher build**. It uses the maintained engine's `sqlcipher` cipher scheme in its recommended modern (`legacy=0`) format: AES-256-CBC with per-page HMAC-SHA512 authentication, PBKDF2-HMAC-SHA512 (256,000 iterations), and no plaintext header. Compatibility with the official SQLCipher CLI/DB Browser file format is not claimed. The cipher and format parameters are fixed by this application; do not change them on existing files.

Verified locally on **Windows 11 Pro x64, build 26300, Node 22.18.0** (confirmed through the Windows operating-system identity). The driver ships Windows x64 native Node-API binaries; no local C++ compilation was needed. The isolated proof of concept verified loading the native addon, Drizzle, all 15 current migrations, WAL, separate encrypted conversion, and independent keyed reads. Other operating systems/architectures have not been qualified here. The driver has an upstream dependency chain with individual maintainers; continue reviewing releases/security advisories before upgrades.

References: [driver release](https://github.com/m4heshd/better-sqlite3-multiple-ciphers/releases/tag/v13.0.3), [cipher parameters](https://utelle.github.io/SQLite3MultipleCiphers/docs/ciphers/cipher_sqlcipher/), [engine key/memory configuration](https://utelle.github.io/SQLite3MultipleCiphers/docs/configuration/config_sql_pragmas/).

## Architecture and failure behavior

Backend modules live in `apps/api/src/db/encryption/`:

- `sqlite-engine.ts`: keyed connections, fixed cipher configuration, integrity checks, safe errors, connection-lifetime key buffers.
- `encrypted-copy.ts`: engine-supported, explicitly keyed `VACUUM INTO` copies; independent reopening and encryption validation.
- `database-fingerprint.ts`: logical comparison of every schema object and table row, migration rows, application/user versions, and exact integer values.
- `convert-database.ts`: offline preparation of separate encrypted recovery and candidate files; no cutover.
- `restore-encrypted.ts`: encrypted staging, retained pre-restore file, resumable replacement plan, session invalidation.
- `initialize-database.ts`, `cli.ts`, `passphrase-prompt.ts`: explicit creation and local terminal unlocking.

Frontend components, design, financial records, permissions, UUIDs, cents, and migrations are unchanged. Session rows survive conversion. An explicitly requested restore still invalidates sessions, preserving the existing recovery contract.

Encrypted startup requires an existing nonempty encrypted file and a valid passphrase. Missing/wrong keys, plaintext files in encrypted mode, unsupported encryption configuration, damaged pages, and integrity failures stop startup. There is no automatic creation, reset, deletion, plaintext retry, or password-reset recovery. First-run encrypted creation uses an exclusive destination reservation; existing files are never truncated.

Native errors are replaced with generic messages without causes because filenames and bound conversion URIs can contain sensitive material. ORM SQL logging remains disabled. Keys never enter HTTP responses, React code, browser storage, environment files, argv, or database rows. Terminal input is not echoed. Buffers owned by the application are cleared after use/connection close. JavaScript strings/native allocations cannot be guaranteed erased; conversion URI strings are short-lived and never logged. The engine's memory-security flag is enabled and SQLite temporary storage uses memory. Full memory-locking/anti-swap guarantees are not claimed.

## Key management and recovery

The implemented mode uses **manual local unlocking**, not stored keys. Choose a unique, high-entropy database passphrase of 16–1024 UTF-8 bytes. The application login password is independent; changing it does not rotate the database key. A database file carries its random KDF salt, not the passphrase. Each new encrypted copy gets its own salt.

Record the database passphrase in a trusted offline password manager or other separately secured recovery record **before migration/cutover**. Verify that record by reentering it to open a disposable backup copy. A backup requires its matching database passphrase. There is no separate generated backup key, key export, hidden reset key, or recovery bypass. **Losing every copy of the passphrase means losing access to the encrypted database and backups.** Preserve the original recovery copies until cleanup is explicitly authorized.

Windows DPAPI was investigated as an unattended alternative. Windows `ProtectedData` with `CurrentUser` scope could wrap a random key in a user-bound protected blob; service/account migration would require an independent recovery method. It does not prevent malware running as the unlocked user from asking Windows to unwrap the key. This change does **not** add a Node credential-store dependency, DPAPI wrapper, or unattended startup. See [Microsoft's DPAPI guidance](https://learn.microsoft.com/en-us/dotnet/standard/security/how-to-use-data-protection). Manual unlocking avoids storing a machine-readable unlock credential, at the cost of requiring a terminal after every restart.

## Windows commands

Use the repository root, Node 22+, and `npm install` (or `npm ci`). Commands below contain paths only; never append a passphrase to a command. On this host, npm scripts need `--script-shell=cmd.exe`.

### Explicit empty encrypted database creation

For a **new, disposable or separately chosen** destination only:

```powershell
npm --script-shell=cmd.exe run db:encryption -- initialize --destination ./data/new-encrypted.sqlite
```

The terminal requests and confirms the passphrase without echo. This is not a way to replace or recover an existing file.

### Verify an existing encrypted file

```powershell
npm --script-shell=cmd.exe run db:encryption -- verify --destination ./data/new-encrypted.sqlite
```

Verification reopens a new keyed connection and checks database/foreign-key integrity. It also rejects a normal SQLite header. The tests independently demonstrate rejection by an ordinary plaintext SQLite reader; header absence alone is not treated as proof of authentication.

### Safe existing-database preparation — requires explicit authorization first

**Do not execute this against the live database until the user authorizes conversion.** Stop every API/SQLite writer first. Keep the source and sidecars together; never copy only the main file or delete WAL/SHM files. The runtime lease rejects another cooperating API process; also close external database editors.

```powershell
npm --script-shell=cmd.exe run db:encryption -- prepare --source ./data/source.sqlite --recovery ./data/encrypted-recovery.sqlite --destination ./data/encrypted-candidate.sqlite
```

The command:

1. Opens the source read-only with the encryption-capable engine and checks integrity/foreign keys.
2. Creates an **encrypted recovery copy directly**, including committed WAL pages, then reopens and compares its logical contents.
3. Creates the encrypted candidate from that verified recovery copy, then reopens it independently.
4. Compares all schema objects and rows, including every financial module, nulls/cents, ownership, authentication/session data, and migration history. Rechecks that the source logical contents did not change.
5. Stops. It never renames, overwrites, deletes, or selects the original database, and never changes `.env`.

The conversion uses the [engine maintainer's supported VACUUM INTO URI technique](https://github.com/utelle/SQLite3MultipleCiphers/discussions/72). The driver requires its `SQLITE_USE_URI=1` native initialization setting; this is set internally before native initialization. The destination URI is a bound parameter and includes explicit cipher/key parameters. No plaintext temporary database export is made. Existing/occupied destinations cause failure. Incomplete outputs are retained for inspection; no automatic retry or cleanup runs. Logical fingerprinting currently holds table row hashes in memory; large databases may need a streaming comparison before migration.


### Offline candidate verification and restore rehearsal

After `prepare`, the optional `rehearse` command consumes a local safety manifest and reenters the key from the user's separately saved recovery record. The manifest must contain `sourcePath`, `candidatePath`, `encryptedRecoveryPath`, `logicalFingerprint`, and `safetyBackup.path`. It must be generated from a verified, offline safety backup; it contains paths, aggregate counts and checksums, never record contents or secrets. Keep this manifest and all generated reports in the ignored local data directory or another private directory outside Git.

```powershell
npm --script-shell=cmd.exe run db:encryption -- rehearse --manifest ./data/preparation/safety-manifest.json --report ./data/preparation/verification-report.json
```

The command holds source/candidate runtime leases, checks current migration compatibility, independently compares the source, safety backup, encrypted recovery and candidate using exact logical fingerprints, and tests ordinary-reader/wrong-key rejection. It creates an encrypted backup through the existing snapshot utility and restores only into a newly reserved disposable directory. Restored contents must match exactly except for the deliberately invalidated session rows; users, permissions, financial records, migrations and audit rows are not exempted from comparison.

Candidate and restored API verification performs two full Fastify startup/close cycles with new keyed connections and an anonymous `/api/auth/me` check. It uses in-process requests, without opening a network listener, creating users/sessions, or using the user's login credentials. This proves application/database reopening; it is not a production process cutover or a manual login test. The full session-preservation fingerprint must remain unchanged on the candidate.

The aggregate-only report records PASS/FAIL/NOT_RUN per stage. A failure stops further verification and retains generated files for inspection; existing report paths are refused. Nothing changes `.env`, selects the candidate as the live database, deletes recovery copies, or performs production cutover. Rehearsal changes session rows only in the disposable restored copy. Keep APIs and external editors stopped until this command completes, then review the report and obtain separate explicit approval for cutover.

### Production cutover — separate manual step

Only after the verified preparation, backup-key recovery rehearsal, and **explicit user approval**, configure:

```dotenv
DATABASE_ENCRYPTION=encrypted
DATABASE_FILE=./data/encrypted-candidate.sqlite
```

Keep the original database and its recovery copies. Build, then start the API directly in an interactive terminal:

```powershell
npm --script-shell=cmd.exe run build
node apps/api/dist/server.js
```

Enter the passphrase locally. In a second terminal run `npm --script-shell=cmd.exe run dev:web` for the local frontend. For API source development, `node --import tsx apps/api/src/server.ts` also prompts. Encrypted mode deliberately fails without a TTY; the combined `npm run dev`/watcher pipeline is not the supported manual-unlock launcher. Legacy plaintext development commands remain unchanged. There is no browser unlock form or UI redesign.

Verify login, records, financial totals, and recovery again before considering the cutover complete. Ordinary process restart preserves valid sessions. Do not revert to a stale plaintext file after new encrypted writes without a deliberate data-reconciliation plan.

## Encrypted backups and restore

Once an encrypted connection is selected, both manual recovery backups and pre-migration snapshots use explicitly keyed engine copies, independently reopened before success. They share the active database passphrase, with separate salts. Owner-only API authorization, explicit restore confirmation, write suspension while queued, and restart requirements remain enforced.

The native `backup()` API was tested and rejected the incompatible encrypted-source/target configuration. It is **not used for encrypted backup or restore**. Implicit `VACUUM INTO` inheritance was demonstrated in the prototype, but production copies explicitly configure the destination encryption instead of depending on it.

Restore verifies the backup before touching the current database, makes an encrypted recovery snapshot, checkpoints WAL, stages an independently verified encrypted replacement, and persists a rename plan. The old database is retained under a UUID `.retained.sqlite` name before promotion. Startup resumes an interrupted plan; sessions are invalidated after promotion. Do not remove or modify the restore manifest, plan, staged file, or retained file while recovery is pending. Wrong keys/corrupt snapshots stop recovery; nothing is reset. The fault tests simulate interruption at rename boundaries, not power-loss certification.

Previously created plaintext backups are **not converted or deleted automatically**. Keep them secured separately. Encrypted mode rejects them as encrypted snapshots; converting an older backup is a separate authorized preparation operation. Backup metadata/restore plans contain identifiers and timestamps but no financial rows or secrets; filenames, sizes, and those identifiers remain visible. No general file-format encryption is substituted for database encryption.

## Disaster recovery and rotation

To rehearse recovery, copy an encrypted snapshot to a **separate disposable destination**, run `verify` with its matching passphrase, and start a separate API against that copy. Keep any active database closed before replacing files. Existing queued restore is available when the current database is intact. If the main database is missing/corrupt, use a verified separate snapshot destination and explicitly select it; do not initialize over the broken file. Preserve original evidence and sidecars for recovery analysis.

For key rotation, stop writers and run `prepare` with `--source-encrypted` plus separate source/recovery/destination paths. Enter the new passphrase twice, then the existing source passphrase. Both copies are verified under the new key; the original file remains under the old key. Approve/select the candidate separately. Old backups still need the old passphrase; retain its secured recovery record until every retained old backup is intentionally retired. No in-place rekey or automatic key cleanup is provided.

## Threat model and limits

Encryption protects copied/offline database/WAL/backup contents without the passphrase. Page authentication detects modified pages. It does not protect against an attacker controlling the unlocked API, Windows account, debugger, browser session, malicious dependency, kernel, memory dump, swap/hibernation image, or restored older-but-authentic snapshot. It does not encrypt previously written plaintext disk sectors, old backups, metadata, screenshots, or user-created exports. Use OS full-disk protection and appropriate Windows folder ACLs as additional controls; Node's POSIX `mode` flags are not a substitute for Windows ACL administration. Do not claim secure erasure on SSDs.

The UI and business modules do not accept or reveal database keys. Authentication, household permissions, backups and database encryption are separate protections. No financial data, database file, recovery file, or key belongs in Git. No real database conversion has been run as part of this phase.

## Automated evidence

- Encrypted creation/Drizzle migrations, correct key, absent/wrong key, no replacement/fallback, ordinary-reader rejection, corruption detection, encrypted WAL content, connection restart, owned-buffer clearing, safe errors/no console secrets.
- Read-only fictional conversion including committed WAL, exact/null row preservation, non-overwrite/concurrent lease rejection, interrupted preparation retention, separate-destination key rotation/recovery.
- Encrypted pre-migration snapshots with earlier migration history, corrupted snapshot rejection, restore restart at three rename boundaries.
- The complete authenticated household lifecycle runs in plaintext, newly encrypted, and converted modes: users/sessions/roles/approvals, debts/payments, bills, expenses/splits, income, dashboard arithmetic, Owner-only backups, queued restore, and restart.

All tests use fictional disposable databases. No destructive test points at the normal database. Review the test results and remaining deployment actions in the completion summary before authorizing live conversion.

Final verification on 2026-10-19: **179 tests in 45 files passed**; lint, standalone TypeScript checks, and both production builds passed. Production dependency audit reported zero known vulnerabilities. Existing nonblocking Vite bundle-size and third-party annotation advisories remain. The multi-copy key-rotation test has a targeted 15-second allowance for repeated password derivations under parallel test load; production cryptographic settings were not weakened to shorten tests.
