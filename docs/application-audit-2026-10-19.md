# Application audit — 2026-10-19

## Scope and data preservation

Audited the current local React/Fastify/SQLite application: authentication, household roles and invitations, protected ownership, approvals, debts/balances/payments, bills/occurrences/credits, expenses/category splits, income, dashboard reporting, migration compatibility, and backup/recovery.

A new WAL-consistent SQLite safety snapshot was created and verified in the ignored `data/backups` directory before fixes. Live data was checked read-only for integrity, foreign keys, monetary field types/ranges, protected Owner invariants, split allocation totals, income confirmation validity, missing authoritative debt links, and future completed payments. Every check passed. A local digest comparison of all **20 financial tables** against the safety snapshot found them unchanged; no records or financial amounts were printed by that comparison. No schema migration or real-record correction was needed. Existing migrations remain unchanged.

All write tests, approvals, restore operations, and browser activity used temporary or dedicated fictional QA databases. The live database was never restored, cleared, seeded, or rewritten. Database files, backups, screenshots, credentials, and real financial exports are excluded from this commit.

## Findings and fixes

1. **Future dates could be recorded as cleared payments.** Debt and bill creation, correction, and confirmation now reject future completed-payment dates. New creditor verification dates and actual-expense dates also cannot be in the future. Planned bill/debt payments and upcoming due dates remain valid. Existing future-dated records are preserved; actual outflow, bill-paid, and principal-reduction calculations exclude them until their date is reached, and the dashboard flags future completed records for review. The live data check found no such records.
2. **Some arithmetic could silently lose cents at large values.** Monthly bill equivalents and income/bill averages now use integer-ratio rounding. Debt aggregate and payment/principal totals reject unsafe sums. Regression tests cover fractional-cent rounding, safe-integer boundaries, unknown amounts, and duplicate/shared obligations.
3. **Legacy money inputs rounded excess decimals before validation.** Shared bill/expense amount fields now retain raw input, validate exact decimal cents, and block invalid submissions through native form validity. The debt form reuses the same exact-cent parser; debt displays and approval comparisons reuse the exact formatter. Tests cover extra decimals, maximum supported amounts, save failures, and historical field preservation.
4. **Owner confirmation review omitted payment details.** Confirm/cancel review now shows amount, date, method, principal, interest, fees, and reference from the immutable request snapshot. Confirmation explicitly asks the reviewer to verify clearance. Server-side stale-state and permission checks continue to run on approval.
5. **QA and normal localhost apps shared an authentication cookie name across ports.** The isolated browser server now uses a separate cookie name. The configured cookie name is owned by the authentication service and used consistently by controllers/routes. The normal app retains its existing default cookie and session behavior. A regression verifies QA cannot read the default cookie and QA logout clears only the QA cookie.

## Automated end-to-end and regression coverage

`apps/api/src/testing/application-audit.test.ts` drives a complete fictional household through the authenticated API:

- Signup, household creation, Owner-assigned Admin invitation and redemption.
- Owner removal denied to Admin; member proposal remains pending and requires Owner approval; repeated approval is rejected.
- Shared debt creation, unauthorized direct account edit rejection, and Owner approval of an account proposal.
- Shared debt-linked bill payment recorded pending; direct Admin confirmation rejected; Owner approval creates one authoritative debt payment.
- Variable bill actual amount and partial payment; independent one-time bill with pending payment.
- Cash and credit-card purchases; explicit actual income confirmation and idempotent retry.
- Dashboard reconciliation: confirmed income minus actual cash outflows; purchase spending excludes the second counting of debt repayments; linked payment counted once; expected debt minimum replaced by its linked bill obligation.
- Verified backup containing all financial modules; a later source change; explicit restore request; write suspension; restart/restore; session invalidation; new login; restored data and financial totals rechecked; SQLite integrity and foreign keys rechecked.

Additional suites test Owner-only/joint debt protections, Admin/Editor/Viewer authorization, cross-household access, revoked/stale approvals, audit rollback, income rate snapshots/corrections, duplicate submissions, partial/overpaid/credited bills, schedules/month-end anchors, future transaction handling, and populated additive migration upgrades. These are persisted Vitest API/component/calculation tests, not a standalone persisted Playwright browser suite.

## Browser checks actually performed

Using the production build in the isolated localhost:1421 QA app:

- Logged out and back in as fictional Admin and Owner.
- Verified Admin sees no Owner edit/remove controls; Owner-only bill and income records expose read-only controls.
- Submitted a joint-debt payment confirmation request as Admin. The live completed total stayed unchanged while pending.
- Reviewed the payment amount/date/method as Owner and approved it. The original payment changed status, the history retained two existing payment records, and the recorded debt balance/status did not automatically become paid or closed.
- Created a verified backup through Database recovery. Actual restore was tested against the automated disposable database, not the live database.
- Reconciled the browser dashboard after approval. Checked the approval dialog at a 390×844 viewport and reset the override afterward.
- Checked exact-cent amount-field validation and retained invalid input without saving a bill.

Screenshots are stored outside Git; only fictional data is shown. The normal localhost:1420 financial data was not used for browser mutations.

## Commands and results

From the repository root on Windows (the script-shell flag accommodates the host npm configuration):

- `npm --script-shell=cmd.exe run lint` — passed.
- `npm --script-shell=cmd.exe run typecheck` — passed.
- `npm --script-shell=cmd.exe test` — passed: **164 tests in 42 files**.
- `npm --script-shell=cmd.exe run build` — API and web builds passed.
- `npm --script-shell=cmd.exe audit --omit=dev --json` — zero known production vulnerabilities.
- `npm --script-shell=cmd.exe audit --json` — zero known vulnerabilities across production/development dependencies at audit time.
- Source search for localStorage, IndexedDB, Dexie, and browserStore — no source matches.
- `git diff --check` — passed.

## Remaining limits

No blocker was found in the exercised scenarios. The Vite build still reports its existing nonblocking bundle-size advisory and harmless third-party Zod annotation warnings. SQLite backups remain local and unencrypted; no new encryption scheme was added during this audit. Network banking transactions and external services are outside scope.

This review does not constitute penetration-test certification, exhaustive browser/assistive-technology coverage, or hardware/power-loss testing. Browser checks were agent-driven; repeatable API/component/calculation regressions are committed. Same-day creditor-statement/payment ordering remains intentionally unknown until a later reconciliation. Available cash and bank balances are not inferred from recorded cash flow.
