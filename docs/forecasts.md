# Cash flow forecasting — Phase 11

Forecasts are independent estimates, never transactions or bank balances. Enter opening cash at the **start of the as-of date**; actual transactions on/after that date then affect the projection. Leaving cash blank keeps ending/lowest available cash unknown. Negative opening balances are supported. Date presets cover 7/14/30/60/90 days; custom ranges support up to 366 inclusive days.

## Inputs and accounting

- Confirmed Income net deposits are the sole actual inflow source, including authoritative confirmed trading payout income. Gross wages remain informational. Trading P&L, nominal balances and requested/approved payouts are not inputs.
- Active non-trading sources require a first payday and conservative/expected/optimistic net-per-paycheck assumptions. Weekly/biweekly dates use that anchor; monthly dates clamp month ends; annual dates use the anchor month/day. Irregular and semimonthly inputs include only the explicit first date; enter other dates as one-time scenario income. The app does not invent a second payday or hours. Hourly gross uses the existing precise regular/overtime calculation; it is never used as take-home cash.
- Recorded actual purchases/payments reuse `cashOutflows`. Credit-card purchases remain spending without immediate cash outflow; repayments remain cash outflows without being a second purchase. Historical confirmations and source IDs prevent duplicate income.
- Recurring/one-time bills use recorded period amounts or saved estimates. Future dates are generated in memory. Completed amounts, credits and scheduled/pending payments reduce projected remaining obligations. Overdue unsettled periods are brought to the as-of date. Debt-linked bills and verified debt groups share monthly obligations; scheduled payments offset those requirements. Settlement schedules are optional and only accepted offers contribute; linked existing payments remain authoritative.
- Budget purchase-spending and remaining amounts are reference information. They are not blindly added to bill/debt forecasts. Enter an **additional** variable-spending allowance explicitly; its range total is spread evenly across days with remainder cents assigned to the earliest days. Extra debt amounts apply on the final day. One-time adjustments have explicit dates. No scenario changes actual records.
- Optional uncertain payout items are labelled uncertain and off by default. Conservative/expected/optimistic comparisons always exclude them. Saving a scenario does not request a payout.

Unknown amounts, missing due dates or missing income assumptions mark projections incomplete. Known net-change subtotals remain visible; complete ending/lowest cash stays unknown. Potential shortfalls based on incomplete known subtotals are explicitly labelled. A typical paycheck and saved bill estimate are never guaranteed. Payment timing and whether a settlement replaces contractual minimums require creditor confirmation; the projection does not determine legal compliance.

## Storage and authorization

Migration `0027_flowery_gorilla_man` adds immutable forecast scenario and audit tables. Saved inputs, source snapshots and calculated results are preserved for historical reporting (model v1). Saving checks the current source fingerprint, preventing stale preview saves. Immediate transactions include audit writes; persisted idempotency keys prevent retries from duplicating snapshots. Household read authorization is reused. Owner/Admin/Editor can save their planning scenarios; Viewers cannot write. Actual protected financial records are never edited.

Existing startup verifies a pre-migration SQLite backup. Tests exercise plaintext/encrypted migration preservation, FKs/integrity and backup verification. UUIDs, integer cents, UTC timestamps and JSON snapshot contracts are portable to a future PostgreSQL repository/dialect. No cloud services or browser persistence are introduced.

## Verification

450 tests across 121 files passed, plus lint, typecheck and production build. Coverage includes unknown/negative cash, exact-cent daily distribution, gross/net separation, uncertain payouts, variable bills/partial payments, linked-payment deduplication, credit-card treatment, roles/isolation, stale snapshots, idempotency, rollback and restart persistence in both SQLite modes.

Isolated browser QA saved a fictional $500 opening-cash/$100 extra-spending scenario. It retained Unknown ending cash because the fictional debt had no due date, while showing $400 known cash requirements and the missing-date warning. Mobile 390px/tablet checked. No live data was migrated or modified for QA.
