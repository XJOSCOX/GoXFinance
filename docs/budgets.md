# Monthly purchase-spending budgets

## Scope and accounting

Budgets are purchase-spending limits, not cash-outflow budgets, bank balances, savings or permission to spend. A total monthly ceiling can contain multiple category limits; the sum of category limits cannot exceed it. The unallocated remainder is available to other spending within that ceiling. Actual spending always includes unbudgeted categories.

Everyday purchases count on their transaction date, including credit-card purchases and their exact category allocations. Completed standalone bill payments count on payment date against their historical billing-period category. Scheduled, pending, failed, cancelled and future payments and voided expenses are excluded. Debt payments and debt-linked bill aliases are transfers, never additional purchases. Trading records are not inputs. Corrections and cancellations recalculate reports from current authoritative transaction records; budget edits never change transactions.

The bill-obligation panel separately shows estimates, actual billed amounts, completed payments and remaining liability for recorded periods due in the month. Estimates never imply spending or an actual bill. A bill of $342.18 paid $200 has $142.18 remaining, while a saved $300 estimate stays separate. Existing period credits affect the liability calculation. Future periods must exist in Bills to appear; Budgets does not fabricate future actual bills.

## Overlapping scopes and permissions

A household budget and member budgets are independent overlapping ceilings. The household view uses the household budget only and counts each purchase once. Selecting a member shows that member's budget and purchases, plus completed standalone bill payments associated with that member. A shared bill may appear in multiple member views; those views must never be added together. Member limits are not subtracted from, or added to, the household ceiling.

The Owner manages every budget. Admins and Editors may manage their own linked member budget only, using the existing protected-Owner financial permissions. They cannot manage household-wide budgets or another member's budget, including Owner-exclusive records. Viewers read only. Every route authenticates and authorizes household access; writes recheck permission, category ownership, revisions and scope inside a transaction.

## Storage and history

Migration `0025_sturdy_masked_marvel.sql` adds only `budget_months`, `budget_category_limits` and `budget_audit`; no existing financial tables are rebuilt. UUIDs, integer cents within the JavaScript safe range, composite household/category/member foreign keys, uniqueness, revisions and UTC ISO timestamps preserve the existing database conventions. A non-null scope key distinguishes household and member uniqueness without nullable-unique ambiguity. One record per month/scope is retained even when archived: restore it rather than creating a competing budget.

Updates atomically replace limits and retain surviving limit UUIDs. Removed limits remain in audit snapshots. Month/member scope is immutable; copy into another month instead. Create/copy submission keys prevent duplicate retries. Copying an existing month is the template workflow: only settings, category UUIDs and limits are copied, never transactions. It preserves the source and can include its historical archived category associations. Normal new assignments require active categories; existing archived-category limits remain visible and editable. Category renames retain UUID associations.

Plaintext and encrypted SQLite use the same additive migration path and verified pre-migration backup gate. No conversion, key changes, browser persistence or cloud connection is introduced. Backups include the new tables through the existing whole-database backup mechanism. Future PostgreSQL migration needs dialect-specific DDL with UUID/bigint/timestamptz mappings and dependency ordering; repositories isolate SQL from services/UI.

## UI and alerts

Budgets provides month/member filters, category progress, total/remaining/over-budget amounts, spending breakdown, previous-month comparison, audit history, category management and independent month copies. Overview shows a compact household summary for its selected reporting month. Existing category management creates custom categories in the unified catalog.

Thresholds are fixed at 80% and 100% in this phase: below 80% Within Budget; 80–99.99% Approaching Limit; exactly 100% At Limit; above 100% Over Budget. Zero budget with zero spend is At Limit; positive spending against zero is Over Budget. In-app alerts are derived inline on refresh, so no duplicate notification events are stored or emitted. Legitimate expenses are never blocked by budget limits.

No automatic monthly rollover creates records. Choose the month, then Copy previous / template month. Named reusable templates, configurable household thresholds, push alerts and cash-outflow budgeting are not implemented.

## Manual verification (fictional QA only)

1. Open the isolated QA app and select Budgets. Create a household budget for a month with a total and two category limits; confirm cents and category UUIDs persist after refresh.
2. Add a split credit-card purchase in Expenses. Confirm its allocations consume category budgets once. Record a tracked debt repayment and verify it does not add purchase spending.
3. In Bills, save a $300 variable estimate, confirm a $342.18 actual bill and record a completed $200 payment. Verify $300 estimate, $342.18 actual, $200 paid and $142.18 owed remain separate. Pending payments must not consume budget.
4. Correct/void the expense and cancel the payment; verify recalculation and threshold alerts without repeated toast notifications.
5. Choose a new month and copy the prior month. Edit its limits and confirm the original month is unchanged; retry copy and verify no duplicates.
6. Select a member scope and create a separate limit. Confirm household and member planned amounts are not summed.
7. Edit status to Archived / removed, then Restore / edit budget. Verify transaction history remains and archived category limits remain labelled.
8. Test Owner, Admin, Editor and Viewer accounts and a separate household. Verify denied edits and cross-household category/member links.
9. Restart the QA API, refresh, view audit history and verify saved budgets. Automated tests additionally cover encrypted mode, foreign keys, migration backup verification and failed-write rollback.

## Verification results — October 20, 2026

- Lint, TypeScript checks and production builds passed. Full suite: 415 tests across 111 files passed, including plaintext/encrypted migrations, record preservation, permissions, atomic rollback and purchase-spending calculations.
- Isolated browser QA: a fictional $1,000 October budget with a $600 grocery limit and $480 credit-card purchase showed 80% category usage, $120 category remaining and $520 total remaining. Copying to November and changing its grocery limit to $400 left October unchanged.
- Restarting the isolated API preserved the budget, purchase, session and calculated totals. The normal encrypted application loaded the additive migration and budget reports successfully.
- Checked the budget page at desktop/tablet width and 390px mobile width. Controls wrap, summary cards stack and bill details use a horizontally scrollable table. Browser test records remained in the isolated QA database; no financial fixtures or database files were added to source control.
