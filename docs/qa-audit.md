# Phase 5.5 audit

## Confirmed findings before fixes

- Owner-linked joint debts reject non-owner corrections but provide no approval-request workflow.
- No supported backend SQLite backup/restore workflow exists, including a pre-migration financial-data backup.
- Same-day statement/payment ordering cannot be established from date-only records. The estimate currently silently excludes those payments rather than reporting the ambiguity.
- Initial debt balances are absent from balance history.
- Empty PATCH payment bodies pass validation because optional defaults populate the parsed object, producing an unchanged audit entry.
- Balance-form retries after a successful write followed by a refresh failure can append duplicate statements.
- The password input's accessible name includes the visibility button, preventing an exact Password label lookup.
- The dialog focus trap can let Shift+Tab escape when the dialog container itself holds focus.
- A database restore would resurrect saved sessions unless they are invalidated; the recovery implementation now clears sessions before reopening the app.

## Fixes implemented

- Added Owner approval requests for payment edits, cancellations, confirmations, and verified balance changes on authorized Admin/Editor debts shared with the Owner. Pending requests never change live financial data. Review compares original/proposed values and records actor, decision, reason, note, and timestamp.
- Approval rechecks current role, responsibility, ownership, archive state, and snapshot fingerprint. An immediate transaction covers the financial write, payment audit, request decision, and request audit. Duplicate approval and stale approval return conflict errors. An audit-write failure rolls back the financial change. Rejection and withdrawal preserve the current record and request history.
- Added additive migration `0007`: request/audit tables, composite household/debt/payment foreign keys, unique submission and pending-target keys, and a nullable idempotency key on balance history. Existing records are retained.
- Added backend-controlled WAL-safe snapshots, verified automatic pre-migration snapshots, Owner-only recovery controls, explicit restore confirmation, write suspension, restart recovery, exclusive server lease, and session invalidation. Full-database authorization requires ownership of every household and membership coverage of every account. No arbitrary paths or downloads are exposed.
- Same-day statement/payment records now make the estimate unknown. Unknown principal and principal greater than the verified balance also prevent an estimate. Known principal alone is deducted after the verification date.
- New debts retain their entered initial amount in balance history with an explicit initial-source label. Creation time is labeled as entry time when no creditor verification date was supplied. Older debt records are preserved without invented history.
- Empty payment edits and demotion of a completed payment through ordinary edit are rejected. Cancellation remains an explicit audited operation. Balance submissions with the same key are idempotent and reject changed payloads.
- Fixed the Password accessible name, Shift+Tab containment at the modal container, and keyboard arrow/Home/End selection of detail tabs. Forms keep values and remain open on rejected saves.
- Added LF rules for SQL files and compatibility with the released legacy migration fingerprint so Windows line-ending changes do not make valid snapshots unusable.

## Security and integrity review

Reviewed authentication/session repositories, CSRF middleware, role services, member management, invitation issuance/redemption, Owner database triggers, debt access checks, duplicate grouping, payment validation/repositories, and all new request/recovery routes. Existing tests cover Argon2id/normalized email, token hashing, expiration/logout, origin rejection, login rate limiting, invitation replay/expiry/revocation/role restrictions, protected ownership, member approval, household ID manipulation, debt assignments and soft deletion. Financial queries use household/debt keys; composite foreign keys additionally enforce the same scope. Expiration of stale invitations remains internal time-based maintenance. A repository search found no localStorage, IndexedDB, Dexie, or browser financial persistence in `apps` or `packages` source.

## Added and expanded tests

- Admin/Editor request creation, unchanged live values while pending, idempotent submission, concurrent repeated approval, and exactly one applied change.
- Owner approve/reject, requester withdrawal, Viewer and cross-household rejection, Owner-exclusive protection, permission revocation before approval, stale fingerprint rejection, and transaction rollback after a forced audit failure.
- Scheduled-payment confirmation through approval, balance approval, and retained request/payment audit rows.
- WAL snapshot, integrity/schema rejection, explicit restore confirmation, paused writes, exclusive runtime lease, restart recovery, recovery-snapshot retention, and invalidated sessions.
- Migration preservation of existing households/debts/member links, new request tables, foreign-key integrity, and verified pre-migration snapshot creation.
- Same-day ambiguity, missing principal, before/after statement chronology, initial history, empty edits, completed-status protection, and balance retry deduplication.
- Components verify current/proposed amounts, explicit approval/rejection controls, failed review retaining its note, requester-only withdrawal controls, and rejected payment saves retaining financial input.

## Exact final commands and results

Executed from the repository root on Windows:

| Command | Result |
| --- | --- |
| `npm --script-shell=cmd.exe run db:generate` | Generated additive `0007_lyrical_doctor_octopus.sql`; inspected CREATE/ALTER operations |
| `npm --script-shell=cmd.exe run lint` | Passed |
| `npm --script-shell=cmd.exe run typecheck` | Passed for API and website |
| `npm --script-shell=cmd.exe test` | Passed: **66 tests in 19 files** |
| `npm --script-shell=cmd.exe run build` | API and website production bundles passed; Rollup removed harmless third-party Zod annotation comments |
| `node --import tsx apps/api/src/testing/browser-server.ts` | Ran isolated QA server at `http://localhost:1421` with temporary SQLite and fictional accounts |
| `rg -n 'localStorage\|indexedDB\|Dexie\|browserStore' apps packages -g '!**/dist/**'` | No source matches |

An explicit snapshot utility invocation used SQLite `VACUUM INTO` to create and verify the pre-migration development backup. It read the real database only for that authorized snapshot; automated tests never used or overwrote it. An initial verification exposed historical migration fingerprint normalization, which was corrected before proceeding. During implementation, expected chronology/history-count tests were updated for the corrected behavior. A Windows file-rename restore attempt failed in the test environment; restoration now uses SQLite’s supported backup API and passes the restart test.

## Browser-level checks actually performed

Used the in-app browser with Playwright locators and accessibility controls against the isolated QA server, serving the production build. This was an agent-driven end-to-end run, not a persisted Playwright test suite.

1. Admin login; selected household and shared debt loaded.
2. Admin opened Request edit, changed fictional payment total from $100 to $120 and principal from $80 to $100, supplied a reason, and submitted. The request appeared Pending; payment totals stayed $100/$80.
3. Logged out and signed in as Owner. The household-wide queue displayed the request and the review showed current/proposed amounts and reason.
4. Owner approval succeeded. Payment history showed $120 completed and $100 known principal, with one original payment record.
5. Refreshed the browser; the valid session and selected household survived.
6. At a 390×844 viewport, checked payment layout and measured no horizontal document overflow. Opened a nested edit form; Escape closed only that form and returned focus to Edit. Reset the viewport afterward.
7. Inspected the final review layout and browser console: no error entries during this run.

## Not manually tested and known limits

- Every legacy form was not manually replayed in this browser run. Existing automated auth/member/invitation/debt tests passed; new API/component tests cover rejection, rollback, revoked permissions, recovery, and save failures.
- Restore was exercised through API and temporary-database restart tests, not against real user data or by clicking the recovery UI in the browser.
- No real credit reports, financial imports, or external accounts were used. No physical-device mobile test, full screen-reader certification, penetration test, disk-failure test, or mid-restore power-loss test was performed.
- Same-day posting order cannot be inferred from date-only records; a later verified statement resolves the ambiguity. Estimates omit unreported interest/fees.
- Historical initial balances for existing debts are not fabricated. New initial records explicitly distinguish an entry date from a creditor verification date.
- Backups are local and unencrypted. Recovery replaces the whole database, is restricted to a controlling Owner, and needs an API restart. External SQLite tools are outside the application’s runtime lease; close them before recovery.
- Authenticated Owner direct corrections remain available; approval requests apply exact immutable proposals and cannot authorize an open-ended future change.

No remaining blocker was found for the requested local approval workflow in the exercised scenarios. This audit does **not** certify production readiness or remote hosting security. See [recovery.md](recovery.md) for safe recovery procedures.
