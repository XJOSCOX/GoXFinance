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

## Phase 17 — Smart Cash Flow Intelligence

Smart Forecast is the default view. Custom scenarios and older model-v1 snapshots remain available under **Custom scenarios & snapshots**. Smart projections use model-v2 snapshots, the same financial repositories, and the existing `forecast()`/`cashOutflows()` engine. Views cover 7/14/30/60/90 days. The page and compact Overview summary refresh on focus and every 30 seconds; this recalculates the live projection without changing saved snapshots or financial records.

### One paycheck, one inflow

For each source/work period, use a confirmed Income deposit first, then a reviewed paystub awaiting receipt, then a linked pending/expected Income transaction, then the latest saved payroll forecast. An authoritative Income record replaces the payroll estimate. Explicit source-level net/date assumptions only fill dates with no canonical paycheck; they remain labelled assumed income. Confirmed trading payout **Income** can count; trading P&L, Combine results and requested payouts cannot.

Saved forecasts retain work-period dates, expected deposit date, gross/net, confidence, model version and available historical sample count. No new hours, paychecks or unsupported payday schedules are invented. Weekly, biweekly and monthly **explicitly approved** patterns reuse their source schedule. Irregular/semimonthly patterns only use the entered date; a second unsupported payday must be an explicit additional item. Source-level manual assumptions have zero model samples and are not presented as learned predictions.

### Opening cash and time

Migration `0033_slim_the_watchers` adds append-only `forecast_settings_versions`. Each version records the actor, household, revision, reason, timestamp, submission key, confirmed opening cash and buffer. SQLite triggers reject updates/deletes to this confirmation history. Existing scenarios, payroll and financial rows are untouched. Settings changes and scenario saves use immediate transactions, optimistic revisions, source fingerprints and idempotency keys.

Cash confirmation accepts signed integer cents, a local effective timestamp with timezone offset, matching effective date, source, confirmed status/confidence, and optional selected account/balance UUIDs. Only visible active USD manual **available** balances recorded in the last 24 hours are eligible for account selection. Changed balance IDs, duplicates, overlapping linked assets, credit cards and cached Plaid balances are rejected. This is explicit user confirmation of recorded cash, **not** a claim that bank reconciliation or live balances exist.

The user may confirm that opening cash includes all currently recorded activity on its effective date. The server captures those canonical activity IDs. Prior-date actual activity and explicitly included same-day activity are not applied again. Later-date actual activity is included once; activity after an older opening confirmation but before the view starts is carried into the first projection day, retaining the original date. New same-day date-only activity has uncertain order relative to the timestamp: it is flagged and excluded pending review, keeping the projection incomplete. We do not infer bank posting time from an entry's creation time.

With no opening confirmation, show **Opening cash balance required for a complete cash projection.** Known net changes and events still appear, but ending/lowest cash remain Unknown. Missing amounts, dates, private sources or ambiguous timing also keep complete cash totals Unknown; the dashed chart and day inspector show only known conditional subtotals. Negative cash and buffer signals from these subtotals explicitly remain incomplete estimates.

### Obligations, risks and simulation

- Bill occurrences use actual billed amounts first, otherwise saved estimates. Completed payments and credits reduce outstanding obligations. Linked bill/debt payments share one authoritative cash movement and monthly obligation group. Credit-card purchases show spending with zero immediate cash outflow; repayment is cash outflow without a second purchase.
- Pending/scheduled payments remain projected, including overdue payment dates and early payments on bills due beyond the view. Past-due debt amounts may overlap contractual minimums: the larger monthly requirement is used and the ambiguity is disclosed. This is not a contractual satisfaction or delinquency determination.
- The safety buffer is a threshold, never an expense. Household defaults are versioned; simulations can override the buffer without changing preferences. Use “Keep cash confirmation; update buffer only” to preserve the opening amount, effective time and any private account selection.
- What-if controls delay selected paychecks 0–5 days, reduce take-home 0/10/20/30%, exclude an inflow, add dated expenses/income, change additional range spending, add a debt payment, include accepted settlements or postpone an explicitly optional scheduled payment. Real dates, hours and amounts remain unchanged. A postponement can move an event beyond the selected horizon and does not change the creditor's due date.
- Risks explain the date, known amount/unknown amount, related event IDs, confidence, reasoning and possible review actions: negative cash, buffer crossings, bills before payday, delayed pay, missing data, concentrated obligations and large outflows. Daily balances cannot verify intraday order or guarantee an overdraft/late payment.
- Event details link to permitted loaded Income/payroll, bill, debt/payment, expense and refund-origin records. Scenario items explain their explicit assumptions. Main Overview shows only a compact next-paycheck/obligation/risk/status summary.

### Access and privacy

Owner/Admin/Editor may save planning scenarios and cash/buffer confirmations; Viewer cannot mutate them. Forecast source collection filters payroll and Income to the Owner or the source's earning member, and bank accounts to the existing banking visibility rules. Hidden payroll makes a member's projection incomplete. Private selected-account cash confirmations are hidden and cannot be replaced by other members; a permitted buffer-only change preserves the private confirmation. Non-Owners see only their own saved scenarios whose original Income/account sources are still permitted. Snapshots from before the privacy refinement are checked as well, including idempotent retries. Cross-household access remains rejected.

### Manual acceptance checklist

Use an isolated fictional household, not personal payroll or real bank data:

1. Open Smart Forecast without confirmed cash. Confirm Unknown cash, known event subtotals and the exact opening-cash prompt.
2. Confirm $1,000 available cash, a $250 buffer and the correct effective time. Explicitly include currently recorded same-day cash activity. Confirm old deposits/expenses are not applied twice.
3. Create a fictional saved paycheck forecast; review a paystub and then confirm the deposit. Confirm one inflow changes classification and amount each time, never four inflows.
4. Compare a bill's estimate with its confirmed amount; add a partial scheduled payment and a debt-linked bill. Check remaining requirements and authoritative payment totals once.
5. Simulate a five-day delay, 20% smaller paycheck and an $800 repair. Compare shortfall date/amount and buffer days; reset and confirm source financial records stayed unchanged.
6. Inspect timeline days, event basis/source links, missing information, and 7/90-day views at desktop and mobile sizes.
7. Save a snapshot, change live cash/buffer preferences, refresh and restart the API. Confirm saved reports remain identical while the live view updates. Verify a recovery backup in both database modes.
8. Check Owner, earning-member Admin/Editor, Viewer and unrelated-household accounts. Verify private payroll and private account cash are not exposed, and Viewer writes are rejected.

Automated tests use synthetic records only and cover these accounting paths, stale submissions, failure rollback, source privacy, additive migration preservation, encrypted/plaintext restart and verified backups. Phase 17 remains pending user manual acceptance; it is not declared stable by the automated checks.

### Phase 17 verification record

- Full suite: **739 tests across 191 files passed**. Final focused permissions/UI regression: **11 tests across 2 files passed** after the cash-timing, daily-subtotal and Overview placement refinements. Lint, typecheck and production build passed; the existing large frontend bundle advisory remains.
- Isolated localhost:1421 browser QA confirmed manual opening cash of $1,000 with a $250 buffer; the existing same-day $890 fictional receipt was excluded after explicit inclusion in the cash confirmation. A fictional $900 pending paycheck remained separate from received income.
- A five-day delay, 20% smaller paycheck and $800 fictional repair produced a known $100 shortfall on October 21, seven days below the buffer and a conditional $620 ending subtotal. A different source with no upcoming reported paycheck and a debt without a due date correctly kept complete balances Unknown.
- Saved this scenario and restarted the isolated API; cash settings and the original $720 delayed-paycheck/$800 repair snapshot were retrieved unchanged. Tested 90-day selection, existing bill-detail links, compact Overview integration and mobile width 390px with no horizontal overflow. Screenshots and QA records remain outside source control.
- Normal encrypted application restarted through the existing launcher; API ready and website HTTP 200 verified. QA financial writes were confined to fictional databases. The additive production migration uses the existing verified safety-backup path; no real income, debt, bill, expense or cash confirmation was changed by QA.

Manual acceptance is still required using the checklist above.
