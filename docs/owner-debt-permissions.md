# Owner-linked debt account permissions

Reviewed and corrected on 2026-10-19.

## Finding and fix

The account service previously blocked non-owner changes to Owner-exclusive debts but permitted direct edits and Admin archive/restore on joint Owner debts. Payment and balance corrections already required approval. The account service now rejects all non-owner direct account writes whenever an assignment belongs to the protected household creator, regardless of which member created the debt. This protects creditor identity, amounts, status, collection metadata/links, responsible members, notes, and archive state. Creating a separate collection linked to a protected original cannot bypass the link guard.

| Account | Owner | Authorized Admin/Editor | Viewer / unrelated member |
| --- | --- | --- | --- |
| Owner-exclusive | Direct account management | No management or proposals | No management or proposals |
| Joint with Owner | Direct management; review proposals | Request edits, archive, restore; no direct account writes | No management or proposals |
| No Owner assignment | Existing permissions | Existing creator/responsibility restrictions | Existing read-only restrictions |

“Authorized” retains the existing creator/responsibility checks; an Admin title alone does not grant access to manage every debt. Cross-household references and requests remain denied. Existing payment creation permissions are preserved; payment modifications and verified balances on joint Owner debts continue through their existing approval actions.

## Approval behavior

- Shared request actions now include `edit_account`, `archive_account`, and `restore_account`. The existing API routes, Owner queue, Approvals tab, withdrawal, confirmation controls, and audit store are reused.
- The website offers Request edit/archive/restore for eligible members and requires a reason. Account proposals preserve omitted fields rather than applying schema defaults. Assignment comparisons show names and responsibilities; collection references show account labels where available.
- Only the Owner can approve or reject. Submission and review use immediate SQLite transactions. Applying the account change (including member associations), completing the request, and writing audit records succeed or roll back together.
- Approval rechecks the requester's current role/responsibility and fingerprints the current record and balance history. Changes since submission prevent approval. Rejected or withdrawn requests retain their history; stale requests remain available for Owner rejection and replacement. Duplicate submission replays its original request; repeated approval cannot apply twice.
- Account edit/archive timestamps advance even for edits within one millisecond so a quick change-and-revert cannot reuse the original fingerprint.
- Current balances and verification dates cannot be overwritten by account proposals. Use the existing verified-balance approval action to retain statement history.

## Migration and data safety

New Drizzle migration `0008_slow_magma.sql` widens request CHECK constraints. Because SQLite cannot alter these constraints directly, it copies request and audit rows within the migration transaction, recreates the affected tables, and restores the rows and indexes. Foreign keys remain enabled. It does not replace debts, payments, users, sessions, ownership records, or previous migrations. The existing startup process creates a verified snapshot before pending migrations on a populated debt database.

No user database was opened or modified during this fix. Tests use temporary databases and fictional records. Database files, backups, and financial exports are excluded from the commit. Restart the API normally to apply the migration to a local installation; refresh the website for the updated request controls.

## Verification

Commands from the repository root on Windows:

- `npm --script-shell=cmd.exe run lint`
- `npm --script-shell=cmd.exe run typecheck`
- `npm --script-shell=cmd.exe test` — 76 tests across 22 files
- `npm --script-shell=cmd.exe run build` — API and website production bundles

New integration coverage includes direct sensitive-field attempts, Owner-exclusive/joint debts, successful Admin and Editor proposals, Viewer and unrelated-household denials, foreign member/link rejection, sparse patches, approval races, stale records, role revocation, request withdrawal/rejection, and forced submission/approval/rejection/withdrawal audit failures. A populated pre-0008 database verifies exact preservation of requests, audit rows, payments, sessions, members, and ownership, plus SQLite integrity and foreign keys. Component tests cover request-form failure retention and retry keys, proposed member changes, and explicit archive-state review.

This change was verified with automated API, database, and component tests; the prior manual checklist predates this fix. Builds may report non-blocking third-party Zod comment warnings and a JavaScript chunk-size advisory. No new finance module or authentication mechanism was added.
