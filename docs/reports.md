# Financial reports and exports (Phase 13)

The Reports page reads existing financial modules. It never records income, payments, account balances, projections, or valuations. There is no reports migration or additional financial ledger.

## Boundaries

- `report.sources.ts` composes existing authorized services and household-scoped repositories. Routes contain no SQL. The report service validates scope and emits explicitly selected primitive fields, never raw database rows or saved source JSON.
- `report.scope.ts` permits the Owner to export household records. Admin, Editor, and Viewer exports are restricted to their active linked member's associated records, including joint records once. Owner-exclusive records and unassigned household projections are excluded. Other-household and unavailable filter identifiers are rejected. Saved member net-worth aggregates are omitted if they contain records outside the current export scope. An asset with a protected linked liability has unknown equity.
- `report.activity.ts`, `report.positions.ts`, and `report.trading.ts` reuse `cashOutflows`, `incomeSummary`, `budgetSpending`, `budgetCategoryRows`, `netWorth`, `debtPayoffProgress`, `settlementProgress`, `simulatePayoff`, `tradingStageTotals`, `tradingResultTotals`, `goalWindows`, and `goalProgress`.
- Export writers use ExcelJS and PDFKit. They receive the same whitelisted financial report contract as the preview. No password hashes, session tokens, encryption keys, source snapshots, or submission keys are serialized.

## Accounting and dates

Confirmed deposits are income. Expected and pending paychecks remain separately labeled. Monthly rows sum to the selected portion of each year. Net recorded cash flow is not an actual bank balance.

Purchase spending includes credit-card purchases. Completed debt repayments are cash outflows, not second purchases. A debt-linked bill alias is excluded because its authoritative debt payment owns the cash flow. Scheduled, pending, failed, cancelled, and future completed payments never enter completed cash-outflow totals. Payment history retains statuses and known principal/interest/fees independently.

Bill estimates, actual billed amounts, credits, completed payments through the report cutoff, and remaining amounts are separate columns. Estimates are not actual money owed. A corrected historical bill or payment is reported using its current corrected ledger value; this is not a reconstruction of what the UI showed before the correction.

Debt and asset observations use dates at or before the earlier of report end and today. Legacy historical ownership/archive/duplicate metadata is not reconstructed. Backdated views disclose this limitation; immutable saved net-worth captures retain their original dated totals. Payoff progress requires distinct dated balance observations, never the assumption that every payment reduces principal. Saved payoff and forecast scenarios retain original snapshots and are labeled projections. Settlement terms have their own audit history; installment links do not add another cash outflow.

Combine and funded P&L are separate. Copy parent events are not added to their account-level results. Missing profit/loss breakdowns remain unknown. Payout requests and approvals are not income. Confirmed payout deposits appear as a subset of authoritative Income, not an additional household income total. Goal calculations use the existing engine through the report cutoff and retain the complete target and dates of overlapping goal periods.

All money fields in the contract, JSON, CSV, and Excel use exact integer cents. PDF and browser previews format cents as dollars. Excel values of 15 or more digits are exact text to avoid spreadsheet precision loss. Null is `Unknown` in human-readable formats and remains null in JSON. UTC source timestamps and original date-only transaction meanings are retained.

## Filters

The route selects the household. Month/year shortcuts populate custom dates (up to ten years). Member scope applies across modules. Category filters apply to purchase allocations, historical paid-bill period categories, debt repayment categories, and category budget rows. Debt filters apply to debts, debt-linked bills, settlements, and linked assets. Trading account and copy-group filters apply to trading and linked goals; payout-income rows require an authoritative account payout link when those filters are active. Unrelated sections retain their own scope. Every export includes the filters and basis notes.

## Privacy and file handling

Authenticated, CSRF-protected POST endpoints: `/api/households/:householdId/reports/preview` and `/export`. GET `/options` returns scoped filter choices. Rate limits apply. Downloads have private/no-store, attachment, and nosniff headers. Files are generated in memory and not saved by the server. The client uses a temporary Blob URL and revokes it. There is no cloud upload, email, or publicly served report directory.

CSV is a long-form table (`Section, Row, Field, Value, Unit, Basis`) to represent heterogeneous report tables without ambiguous columns. Strings beginning with formula-like characters or leading whitespace before them are prefixed with an apostrophe; quotes/newlines are escaped. Negative numeric cents remain numeric. Excel strings are literal text cells, never formula objects or automatic hyperlinks. PDFs use literal text and do not execute HTML or create active scripts/attachments.

Ordinary PDF/Excel/CSV/JSON downloads are **not encrypted by database encryption**. The UI warns before downloads. This phase does not invent an encrypted report container or retain export passphrases. Use a trusted encrypted destination for downloaded reports. Existing encrypted SQLite recovery backups remain the restorable backup mechanism; JSON has `restorable: false`, a schema version, and a financial-report discriminator. It is deliberately not accepted as a database restore.

Reports are capped at 10,000 rows / 200,000 cells; PDFs at 20,000 cells. Narrow the date range for large datasets. PDF uses PDFKit's standard Latin font; complex scripts require a future embedded-font extension. This affects PDF typography, not the UTF-8 JSON/CSV/Excel source values.

## Verification

Disposable plaintext and encrypted SQLite integration tests cover persistence/restart, integrity, permissions for all roles, Owner-private exclusion, joint records, cross-household and forged filters, authentication/CSRF, linked payment deduplication, partial bills, credit purchases, category allocations/budgets, copied result aggregation, confirmed payout income, historical valuations and goal cutoffs. Export tests reopen Excel files, verify exact cents and inert text, exercise CSV injection cases, and verify multi-page PDFs. Browser checks use the isolated fictional QA household. Generated files and screenshots stay outside source control.
