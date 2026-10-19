# Bills, everyday expenses, and Overview

## Use

- **Bills**: add a recurring schedule or a one-time obligation. Fixed amounts and variable budget estimates are separate fields. A one-time bill generates exactly one period.
- Open a bill to choose a billing period, enter its actual billed amount, record an explicit credit, and inspect payment history. Entering an actual amount does not pay the bill.
- **Mark paid / record partial** requires an entered payment amount and date. Saving defaults to a **pending** payment. You may explicitly confirm clearance when selecting Completed, or confirm a previously scheduled/pending record later. An Owner-linked joint bill requires the Owner to approve confirmation and other sensitive changes.
- Partial payments leave a remaining amount. Excess payments appear as **overpaid**, and credits are recorded separately. An unknown actual bill amount stays unknown even if an estimate or payment exists.
- Variable averages use actual billed amounts from the last 3, 6, or 12 completed periods and show the sample count. Applying an average to future estimates requires explicit confirmation.
- **Expenses** records everyday purchases. Assign one responsible member and one or more category allocations whose integer-cent amounts equal the total. Corrections and voiding retain audit history. Voided expenses do not contribute to spending.
- **Overview** reports stored debt balances, monthly expected obligations, monthly purchases, confirmed cash paid, outstanding bill periods, and missing-information alerts. It does not infer income or available bank cash.

## Accounting rules

The shared `cashOutflows` model distinguishes purchase spending from cash paid:

| Record                                                  | Purchase spending | Cash paid |
| ------------------------------------------------------- | ----------------- | --------- |
| Cash/debit everyday purchase                            | Amount            | Amount    |
| Credit-card purchase                                    | Amount            | Zero      |
| Confirmed standalone bill payment without credit        | Amount            | Amount    |
| Confirmed standalone bill payment on credit             | Amount            | Zero      |
| Confirmed debt repayment without credit                 | Zero              | Amount    |
| Scheduled, pending, failed, cancelled, or voided record | Zero              | Zero      |

A debt-linked bill confirmation creates one authoritative debt payment in the same database transaction. The bill stores its ID. Reporting excludes that bill-payment alias and counts the authoritative debt payment once. Corrections/cancellations update that same debt payment; no second repayment is created. Reading bill history reflects corrections made through the debt manager. Unknown principal remains unknown: a bill payment does not invent a new debt balance.

For expected monthly obligations, a linked recurring bill replaces the matching debt minimum rather than being added to it. Verified collection/original account groups use the existing deduplication rules. A second active schedule for the same debt group is rejected. This does not retroactively match arbitrary manual transactions: use the linked bill workflow for a single payment, rather than independently entering it again in Debts or Expenses.

Recording a purchase never changes a bank balance or a debt balance. A credit-card link on an expense identifies the payment instrument, not an authorization to modify the debt account.

## History and schedules

Periods have independent UUIDs, billing-period labels, due dates, actual amounts, estimate snapshots, credits, and payments. Dates use `YYYY-MM-DD`; timestamps use UTC ISO 8601. Schedules use their original anchor day, including month-end/leap-year clamping. Refresh is idempotent and generates periods through today plus the next upcoming period, bounded by an optional end date. It never creates completed payments.

Recurring template edits apply to newly generated periods; existing period amounts and estimates remain historical snapshots. Update a specific period explicitly to correct its actual billed amount. One-time due-date edits move the existing period rather than producing another occurrence. Stopping a recurring schedule stops generation; existing unpaid periods remain visible and payable.

## Permissions and transactions

All operations resolve the authenticated household on the server. Viewers cannot create, edit, void, or pay financial records. Owners can manage household bills and expenses. Non-owners cannot assign the protected Owner to new records or manage the Owner's exclusive records. Editors may create assignments only to themselves. Non-owner management additionally requires responsibility for, or creation of, the record.

Authorized Admins/Editors can propose sensitive changes to Owner-linked joint bills. Bill requests follow the existing debt approval conventions: stored exact proposals, original-value snapshots, fingerprint-based stale rejection, current-permission rechecks, single conditional review, and an immediate SQLite transaction covering changes, review, and audit. No proposal changes the live bill. Only the Owner approves/rejects; requesters may withdraw. Linked debt payment routes also check bill permissions to prevent bypassing this workflow.

Expenses have exactly one responsible member, so Owner-exclusive expenses are Owner-only. A member's own credit purchase on an authorized shared card does not modify the Owner's debt. There is no multi-member expense ownership or expense approval queue in this phase.

## Database and migration safety

Additive migrations `0009`–`0012` create the bills, assignments, periods, payments, requests/audits, expenses, category allocations, and category/audit tables. Existing released migrations and financial tables are unchanged. Period credit metadata is added in place, preserving payment foreign keys. Billing-period labels are backfilled from existing due dates. UUIDs, cents, UTC timestamps, foreign keys, indexes, and scoped relationships support a future separate PostgreSQL dialect.

Existing databases receive the application's verified pre-migration snapshot. Database files, snapshots, secrets, and exports remain ignored by Git. No real bills, expenses, or payments are seeded. Default category names are generic metadata stored per household, with UUIDs ready for future custom-category management; no custom-category editor is included yet.

## Debugging and verification

- UI: `features/bills`, `features/expenses`, `features/dashboard` separate API clients, data-loading hooks, presentation, and forms.
- API: each module separates HTTP validation, service authorization/transactions, and repository queries.
- Pure calculations: `packages/shared/src/bill-calculations.ts` and `outflows.ts`.
- Inspect failed operations in the visible form/notification. Success is reported only after an authenticated API response confirms persistence. Do not log personal or financial payloads.
- `npm run format -- <files>` formats named files using the shared Prettier configuration. Shared UI fields/cards/comparison tables use existing Tailwind utilities; there is no new feature stylesheet.
- Run `npm run lint`, `npm run typecheck`, `npm test`, and `npm run build`.
- Integration tests use disposable fictional SQLite databases, reopen the API to verify persistence, check foreign keys, simulate audit-write failures, and exercise Owner protections, approvals, stale proposals, cross-household access, and linked-payment deduplication.

The site is still the local React/Fastify application: `npm install`, then `npm run dev`, then open `http://localhost:1420`. Data remains in the configured SQLite file (default `data/goxfinance_web.sqlite`). No Income, Trading, bank account tracking, Supabase, or advanced charts are included.

Enhanced amount presets, allocation fields, migration `0013`, and all five payment statuses are documented in [payment-options.md](payment-options.md).

### Confirming usage-based bills while recording a payment

Bill amounts display separately: budget estimate, confirmed bill total, completed payments, and remaining owed. In **Record payment**, optionally select **Confirm the actual bill total for this period** and enter the amount shown on the bill. Enter the actual payment independently; partial payments do not imply that the bill was paid in full. An estimate never prefills a payment or becomes a confirmed bill automatically. Until the bill total is entered, the remaining amount stays unknown.

The optional `billAmountConfirmation` payment input includes the actual amount in integer cents and the expected bill revision. The API validates permissions and revision, then saves the period amount, payment, linked debt transaction (when applicable), and audit entries in one SQLite transaction. Retries use the same submission key; conflicting payloads and stale revisions are rejected. Estimates and other periods remain unchanged. Owner-linked joint bills still require the existing Owner approval workflow for amount changes; non-owners cannot use payment recording to bypass it. No schema migration is needed.

### Overview bill amounts

The overview groups budget estimates, confirmed bill totals, completed payments, and known remaining amounts by the bill period's due month. Payments toward these periods may have cleared in another month; the separate payment activity and cash-flow totals use payment dates. Estimates never substitute for actual billed amounts or amounts owed. Unconfirmed totals are explicitly excluded and flagged. Payments on unconfirmed bills are still shown as paid, with the remainder unknown. Credits and overpayments appear separately. Debt-linked payments are counted once in the bill-period view and once in the authoritative payment activity, never added together as duplicate cash outflows.
