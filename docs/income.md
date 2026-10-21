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
