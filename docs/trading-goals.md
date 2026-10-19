# Manual trading, copy groups, payouts and goals

## Boundaries

GoXFinance records manually entered external activity. It does not connect credentials, execute or copy trades, flatten positions, submit withdrawals, check official eligibility, or enforce Topstep limits. Topstep is the initial provider. Only the last four identifier characters may be stored. Nominal tiers, simulated balances and realized trading P&L are not household cash or assets. A reported trading balance is an independent manual observation, not an inferred balance from results.

## Sessions and realized results

Each account has an explicit IANA timezone and session start time. Session dates are labeled by the **start calendar date** in that timezone. For example, with an 18:00 boundary, an entry at 17:59 belongs to the preceding session. This convention is configurable tracking metadata, not a claim about current Topstep rules. The timestamp picker uses the device timezone; stored timestamps are UTC ISO 8601, and results retain their account timezone/boundary snapshots through corrections. Weekly performance buckets start Monday. Trading goals have their own explicitly selected timezone and boundary so daily/weekly rollover does not assume midnight.

There is one manual daily summary per account/session, corrected in place with revision checks and an audit trail. Gross and fees are integer cents; net is gross minus fees, and may be negative or zero. Performance filters sum only the selected accounts' actual result rows. No net result is inferred from nominal tier or position size.

## Copy groups

Groups designate a lead, distinct followers and quantity multipliers. No instructions are sent to accounts. A copied event records explicit account quantities, gross P&L and fees. There is no automatic monetary estimate or replication. All included account values must be supplied; the lead must be included. A group membership snapshot and per-account session metadata are retained on the event. Editing a group affects subsequent events only; event corrections retain the original account set and stable row IDs, with before/after audit records. Multiple trade events are allowed per session. A daily copied summary cannot overlap trade events or a manual daily summary for any included account/session. Group performance and group goals use the group's historical events, not its current membership applied retroactively.

## Payouts and income

A payout batch is a parent container for independent account payout records. Requested and approved amounts never create income. Each account can be approved, rejected, received or cancelled independently. Batch summaries are not additional financial transactions. Matching requests without distinct external references are rejected as ambiguous duplicates; retry keys also prevent repeated submissions.

A paid payout requires explicit receipt confirmation, actual net received amount and actual deposit date. It either creates a dedicated irregular trading-payout Income source/deposit or links an existing confirmed trading deposit with exactly matching member, amount and date. A transaction can link to only one payout. Requested versus received differences are displayed rather than guessing fees/profit splits. Changes to a paid payout update the same Income transaction atomically; cancellation cancels its linked deposit, preserving history. Direct Income editing of linked deposits is blocked: correct them in Trading. Terminal rejected/cancelled payouts are retained and a new request must be recorded for subsequent activity. No past payments or income are manufactured.

User-entered payout rule snapshots are append-only metadata, labeled advisory. They are not evaluated as authoritative payout eligibility. Verify provider restrictions externally before performing any copying or withdrawal activity.

## Goals

Types: trading net profit, net loss budget, confirmed income, explicit savings contributions, verified debt reduction, purchase spending limits, completed bill payments, and custom manual contributions. Account-specific, copy-group and combined trading scopes are supported. Loss budgets measure net loss magnitude; profit goals preserve negative net P&L and their full shortfalls. No target guarantees returns or encourages increasing risk.

Daily/weekly/monthly/quarterly/yearly periods repeat from the chosen first date; custom periods do not repeat. History shows up to the last 12 anchored periods using the **current** definition. Goal edits are audited; historical target versions are in the audit, not separate frozen achievement snapshots. Completion state is user-managed. An indicator for an ongoing spending/loss period means within limit so far, not final success.

Confirmed-income progress uses actual deposits. Purchase spending includes credit-card purchases and excludes debt repayment duplicates. Bill-completion progress counts completed payments against confirmed bills due in the goal period, capped at actual amounts; missing actual bill amounts are flagged. Credits are not represented as cash payments. Debt reduction requires confirmed debts and a statement/reconciliation baseline at or before the start plus a later qualifying observation, with verified duplicate creditor links counted once. Missing coverage remains incomplete/unknown; gross debt payments never stand in for principal reduction. Savings/manual progress uses explicit contributions and signed adjustments, not bank balances. Correct erroneous contributions to zero with an audit reason. Goals with contribution history cannot be reassigned or change measurement type.

## Permissions and persistence

All reads/writes authenticate through the existing backend. The Owner can manage records in their household. Admin/Editor users can manage their own member's accounts and goals, but cannot manage Owner records or household-wide goals. A group/event/batch write requires authority over every affected account, including previous members when editing a group. Viewers read only. No ownership transfer or new permission bypass exists. Record revisions reject stale corrections; idempotency keys and uniqueness checks prevent retries from duplicating financial rows. Account/result/payout/group/batch/contribution changes and audits run within SQLite transactions; payout Income operations share that transaction.

Migrations 0016-0018 add normalized UUID tables and nullable fields only. No existing financial tables are replaced or removed. The existing verified pre-migration backup gate remains in place for both legacy plaintext and opted-in encrypted databases. No automatic conversion occurs. Composite foreign keys enforce household ownership; additive SQLite integrity triggers protect the new goal-group and payout-batch links where ALTER TABLE cannot add composite constraints. PostgreSQL should use native composite foreign keys for these links. Portable integer cents, UTC timestamps, service/repository separation and parameterized Drizzle queries remain in use. Existing backups include the new tables automatically; no database or export is committed.

## Manual QA handoff

Use an isolated household with fictional data before real entry:

1. Add four accounts with explicit timezones/boundaries. Verify the nominal tiers never affect overview cash flow.
2. Enter positive, negative and zero sessions; correct an entry and verify daily/weekly/monthly totals and history.
3. Create a copy group, record different per-account quantities/results, then edit membership. Confirm old event membership remains unchanged and overlapping daily summaries are rejected.
4. Create a batch with four different request amounts. Approve one, reject one, receive one, and leave one requested. Confirm only the received payout appears once in Income and overview cash flow.
5. Correct and cancel a received payout; verify its original Income deposit changes rather than duplicating. Try linking an already-entered matching deposit.
6. Create daily/weekly/monthly profit, loss, group, savings and spending goals. Verify negative results, shortfalls, limit overages, contributions and period history.
7. Verify Owner, Admin, Editor, Viewer and cross-household behavior; refresh and restart the API; verify backup/recovery in the configured SQLite mode.

Remaining limits: manual entry only; no official rule/eligibility engine, broker connection, automatic bank reconciliation or market data. Session conventions are user-configured. Goal history recalculates against current target definitions, limited to 12 periods. Native build currently retains the existing non-blocking frontend bundle-size warning. Manual end-to-end acceptance remains with the user after this implementation.
