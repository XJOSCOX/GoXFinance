# Income management

## Sources and ownership

Income sources and their paychecks live exclusively in SQLite. A source has an earning household member, frequency, optional rate/estimates, configurable weekday, and overtime multiplier. No rates, hours, personal employers, or confirmed income are seeded. A source's expected amounts are **per pay period**, not actual receipts.

Owners manage all household income. Admins and Editors can manage only sources assigned to their own active linked member; they cannot assign or change another earner's records, including the protected Owner. Viewers are read-only. Every read/write is scoped to household membership on the server. Source reassignment with existing pay history is rejected; create a new source for the new earner instead. Archive/restore retains all paychecks and audit records.

## Variable pay and confirmation

Use Income → Income sources to configure a weekly payday (including Thursday). The page displays the next expected weekly payday. Enter hours manually; regular hours are never assumed to be 40. An upcoming prompt is a projection, not a generated transaction. Historical pay dates and work periods can be entered manually for late/missed paychecks.

Regular and overtime hours are decimal strings with at most two decimal places. Multipliers support three decimal places and default to 1, without assuming overtime eligibility. Gross estimation uses integer BigInt arithmetic on hundredths of an hour and thousandths of a multiplier, rounding once to the nearest cent (half up). Each transaction snapshots its rate, multiplier, source type, frequency and expected amounts. Changing the source does not rewrite pay history.

Transactions have independent expected/pending/confirmed/cancelled statuses. Confirmation requires an actual net deposit, deposit date no later than today, and explicit receipt acknowledgement. Actual gross and deductions are optional and remain separate from net pay. Pay date, work period, deposit date, and UTC confirmation timestamp are distinct fields. Trading receipts require an explicit withdrawn-and-received acknowledgement; no account sizes or hypothetical profits are counted.

## Corrections, duplicates, and audit

Corrections and cancellations require the current revision and a reason. Writes and before/after audit entries commit in one immediate SQLite transaction; a failed audit rolls the write back. Concurrent stale corrections return 409. Original confirmation time is preserved; later correction/reconfirmation times are available in the audit history.

Create requests use stable UUID idempotency keys. Active paychecks are unique per source/work period; regular sources also enforce a unique pay date. References are unique per source when supplied. Distinct same-day irregular receipts can use distinct references. Without a work period or reference, an irregular receipt is unique per pay date. Reuse an existing expected/pending entry when confirming, rather than entering a second paycheck. Cancelled records remain in history and are excluded from totals.

## Reporting

Only confirmed actual net deposits dated on/before today count as received. Monthly totals use the **deposit date**. Pending totals and recorded future expectations use expected net, show unknown-amount counts, and never count as cash. Source estimates are shown separately from recorded expectations and are not extrapolated into fictitious transactions.

Recorded paycheck statistics are grouped by employer/source and the transaction's saved pay frequency. A single confirmed paycheck shows its net amount and sample count; a per-paycheck average appears only after two confirmed records. Missing uploads are not assumed to be zero-income weeks. Weekly deposit totals are shown by default, with calendar-month totals available as an optional history grouping. The reporting month filters the top totals independently of the pay schedule; a shortcut selects the latest recorded pay month. Reporting-month/member/source filters do not turn historical source estimates into actual income.

The dashboard displays confirmed income, confirmed cash outflow, and their difference: **net recorded cash flow**. This is not a bank balance or available cash: opening cash balances and unrecorded transactions are excluded. Existing outflow rules continue to count linked bill/debt payments once and distinguish credit purchases from repayments.

## Storage and migrations

Migration `0014_funny_chat.sql` adds `income_sources`, `income_transactions`, and `income_audit`; it does not rewrite existing tables. Composite foreign keys enforce household-scoped members and sources. Partial unique indexes enforce non-cancelled paycheck uniqueness. Existing installations create a verified SQLite snapshot before migration through the existing backup runner. Timestamps are UTC ISO 8601; work/pay/deposit dates are calendar `YYYY-MM-DD` values. Currency is integer cents, never floating-point dollars. No browser database or browser preference storage is used.

PostgreSQL migration will require a separate Drizzle pg-core schema and driver, UUID/bigint/numeric/boolean/timestamptz mappings, and household ownership policies. The current service and shared calculation layers remain independent of SQL dialect; partial uniqueness and composite household foreign keys have PostgreSQL equivalents. Decimal hour/multiplier strings can map to numeric columns without changing the API. There is no Supabase connection, authentication change, or synchronization in this phase.

## Verification

Automated coverage includes variable hours and decimal rounding, configurable paydays, missing-upload handling and per-paycheck averages, source/transaction CRUD, immutable source snapshots, idempotency and uniqueness, confirmation validation, historical corrections and audits, multiple earners, trading receipt restrictions, role/Owner protection, household isolation, failed-write rollback, foreign keys, restart persistence, dashboard reconciliation, and populated migration upgrades. UI tests cover exact amounts, confirmation acknowledgement, saved historical rates, and preserving form inputs/idempotency after failure. Browser QA uses only an isolated fictional database.

Remaining boundaries: no banking integration, tax calculation, automatic payroll import, overtime eligibility determination, or automatic recurring confirmed-income generation. This phase stops after verification; the full application audit is next.

Paycheck history defaults to **All dates**, independent of the overview reporting month. Optional month/member/source/status filters show the visible and total record counts, plus a clear-filters action so older paychecks are not silently hidden. Confirmed entries use their deposit date for filtering and sorting; unconfirmed entries use their printed pay date.

## Income workspace layout

### Estimate next paycheck

The Income overview displays the earliest upcoming saved draft/submitted/processing forecast across all dates, independent of the reporting-month filter. It follows employer/member filters and includes employers with no received paychecks yet. The card shows expected payday, worked time (exact minutes when available), latest-version gross and take-home estimates, and confidence. Reviewed/received/cancelled paychecks, past paydays and archived/inactive employers are excluded. Forecast values are never added to received-income or cash totals; unknown take-home stays unknown.

Use Upload paycheck on that card to reconcile the document with its draft. Upload review also suggests a unique matching draft by overlapping work period or expected payday and lets the user explicitly choose another saved estimate for the selected employer. The existing draft UUID is retained; reviewed amounts/hours come from the statement, while immutable forecasts remain available for comparison. Missing actual hours/rates stay unknown. If statement dates correct a custom work span, the original values are audited and forecasts are excluded from accuracy comparisons across the changed period. Reconciliation, reviewed statement, pending Income and audit writes are atomic, revision checked and idempotent. Already received deposits stay unchanged; new deposits require the existing separate receipt confirmation. No draft deletion or extra income transaction is needed.

Use Income actions > Estimate next paycheck, select an employer, enter full work-period dates, expected payday, regular/overtime hours and editable rates. PTO and bonuses are optional. The live preview and server use the same integer-cent forecast engine and prior-sample selection. Saving creates an audited draft payroll forecast; it never creates a received Income transaction. Saved forecasts can be revised in Payroll, with duplicate and overlapping periods rejected by the existing transactional API.

Time entry uses separate whole Hours and Minutes fields, with minutes restricted to 0-59. Deputy time 38h 34min is entered as Hours 38 and Minutes 34. Legacy decimal and combined-format records remain supported internally; opening an old decimal entry retains its exact stored precision unless the displayed time is changed. Minute inputs are stored as exact integer minutes alongside a validated hundredths display snapshot; earnings use minutes times the saved hourly rate divided by 60, rounded to cents per earnings component. Edits restore the saved hours and minutes into their separate fields. Thus 38h 34min at $25/hour estimates $964.17, rather than prematurely rounding hours to 38.57 and estimating $964.25. Invalid minutes and conflicting snapshots are rejected. These optional fields extend existing hours JSON without changing old records or requiring a table migration.

Custom manual work spans may be shorter than a payroll cycle (for example November 11-15 for weekly payroll); the source frequency remains unchanged. Weekly spans are limited to seven days, biweekly to fourteen, semimonthly to sixteen, monthly to thirty-one, and annually/custom to 366. The custom-span flag and optional historical-deduction choice are additive fields in existing payroll hours JSON; no database migration is required. Uploaded statement validation is unchanged.

When explicitly enabled and component rules cannot determine net, historical take-home uses the mean deduction/gross ratio from up to five nearest-gross, reconciled reviewed statements from the same employer and frequency, ending before the selected period. It includes benefits and withholding in aggregate, is labeled low confidence, warns about extrapolation, and is not a tax calculation. No usable history leaves net unknown. Historical total deductions do not populate individual tax or YTD values. Rates, source settings, prior statements, confirmed income and immutable forecast versions remain preserved.

The overview uses one take-home summary strip, a compact period selector and collapsible member/source filters. The latest statement's earnings and deductions are collapsed by default; the four most recent non-cancelled paychecks are directly accessible below it, with YTD and recorded-paycheck statistics stacked alongside on larger screens.

The primary action is Upload Paycheck. The adjacent action menu contains source creation and manual entry. Overview, Sources, Paychecks and Payroll use a slim tab bar. Source and paycheck actions use the shared keyboard-accessible menu, which closes on selection, Escape and outside clicks.

The overview shows confirmed-deposit-month gross, deductions and net, with unknown-amount counts and a separate all-dates pending count. The latest paycheck retains its original period, printed date, actual receipt, worked/paid hours and expandable earnings/deduction components. A differing statement net and actual deposit are displayed separately. The YTD panel reuses the existing latest-dated component observations without summing consecutive cumulative statements. The Paychecks list remains all-dates by default; each row can open read-only details or the existing audited correction form. All data access uses the existing authorized Income and Payroll APIs; this redesign adds no migration or financial writes.
