# Manual trading, copy groups, payouts and goals

## Boundaries

GoXFinance records manually entered external activity. It does not connect credentials, execute or copy trades, flatten positions, submit withdrawals, check official eligibility, or enforce Topstep limits. Topstep is the initial provider. Only the last four identifier characters may be stored. Nominal tiers, simulated balances and realized trading P&L are not household cash or assets. A reported trading balance is an independent manual observation, not an inferred balance from results.

## Sessions and realized results

### Adding multiple accounts

Use **Duplicate** on an account to reuse its setup, or **Add account** to start fresh. Choose 1–20 accounts and review each nickname and optional last-four identifier. Duplication resets balance, activation date, status, notes and external identifier; it never copies results, payouts, income links or rule history. A new rule snapshot can be entered explicitly. When adding multiple accounts, balances and activation dates start unknown and can be entered separately afterward.

`POST /api/households/:householdId/trading/accounts/batch` accepts an idempotency key and an array of validated account inputs. All accounts and audits save in one transaction. Replaying the same request returns the same account IDs; changing its payload with the same key is rejected. Nicknames must differ within the batch. Each account is separately authorized, including on retries. This uses existing account and audit tables without changing stored records or migrations.

### Removing an extra account

**Delete** opens a confirmation with two choices. **Hide account** sets an audited deletion timestamp and removes the card from the default register. Enable **Show hidden accounts** to restore it. Historical results, payouts, income and reports remain intact. New results, payouts and copied activity require restoring the account first; existing historical entries remain correctable.

**Delete permanently instead** requires typing the account name. The server allows this only when there are no linked results, payouts, income sources, copy groups/events or goals. Account metadata and rule snapshots are removed atomically; deletion audits remain. Retired submission keys prevent a retry from recreating a permanently deleted account. Both operations enforce household permissions and record revisions. Migration 0019 adds only nullable `trading_accounts.deleted_at`; existing records are preserved.

Each account has an explicit IANA timezone and session start time. Session dates are labeled by the **start calendar date** in that timezone. For example, with an 18:00 boundary, an entry at 17:59 belongs to the preceding session. This convention is configurable tracking metadata, not a claim about current Topstep rules. The timestamp picker uses the device timezone; stored timestamps are UTC ISO 8601, and results retain their account timezone/boundary snapshots through corrections. Weekly performance buckets start Monday. Trading goals have their own explicitly selected timezone and boundary so daily/weekly rollover does not assume midnight.

There is one manual daily summary per account/session, corrected in place with revision checks and an audit trail. Gross and fees are integer cents; net is gross minus fees, and may be negative or zero. Performance filters sum only the selected accounts' actual result rows. No net result is inferred from nominal tier or position size.

**Record daily result** supports selecting one, several or all manageable visible accounts. Each account requires explicit gross P&L and fees; nothing is copied into confirmed results automatically. A shared timestamp is interpreted using each account's stored timezone and boundary. `POST .../trading/results/batch` saves all selected summaries and audits atomically, rejects repeated account IDs and existing session results, and safely replays submission keys. Corrections remain per-account with their existing audit trails.

## Copy groups

Groups designate a lead, distinct followers and quantity multipliers. No instructions are sent to accounts. A copied event records explicit account quantities, gross P&L and fees. There is no automatic monetary estimate or replication. All included account values must be supplied; the lead must be included. A group membership snapshot and per-account session metadata are retained on the event. Editing a group affects subsequent events only; event corrections retain the original account set and stable row IDs, with before/after audit records. Multiple trade events are allowed per session. A daily copied summary cannot overlap trade events or a manual daily summary for any included account/session. Group performance and group goals use the group's historical events, not its current membership applied retroactively.

## Payouts and income

A payout batch is a parent container for independent account payout records. Requested and approved amounts never create income. Each account can be approved, rejected, received or cancelled independently. Batch summaries are not additional financial transactions. Matching requests without distinct external references are rejected as ambiguous duplicates; retry keys also prevent repeated submissions.

The payout form links directly to the multiple-account batch form. **Select all accounts** is available in payout batches, copy groups, copied events and daily summaries. A batch request amount can be explicitly applied to selected accounts and individually adjusted before saving. Applying a requested amount never confirms a deposit; received payouts still require independent actual receipt details.

A paid payout requires explicit receipt confirmation, actual net received amount and actual deposit date. It either creates a dedicated irregular trading-payout Income source/deposit or links an existing confirmed trading deposit with exactly matching member, amount and date. A transaction can link to only one payout. Requested versus received differences are displayed rather than guessing fees/profit splits. Changes to a paid payout update the same Income transaction atomically; cancellation cancels its linked deposit, preserving history. Direct Income editing of linked deposits is blocked: correct them in Trading. Terminal rejected/cancelled payouts are retained and a new request must be recorded for subsequent activity. No past payments or income are manufactured.

User-entered payout rule snapshots are append-only metadata, labeled advisory. They are not evaluated as authoritative payout eligibility. Verify provider restrictions externally before performing any copying or withdrawal activity.

### Editable account rules and profit shares

Account setup and rule snapshots are user-entered data, with no provider plan defaults or automatic plan selection. **Update account rules** can apply a reviewed nominal tier, loss limits and new rule snapshot to selected accounts in one transaction. Each account revision and household permission is checked. Existing paths, stages, balances, results, payments and prior rule snapshots are preserved. The optional version-2 rule fields include evaluation targets, consistency percentages, qualifying-day amounts, contract limits, plan/reset/activation fees and plan flags. Older JSON snapshots remain readable; no database migration is needed because snapshots already use the existing SQLite rule table.

Payout forms and batches show a split estimate using the configured trader share in basis points. Integer/BigInt arithmetic rounds the trader portion to the nearest cent and assigns the remainder to the provider, so both portions always sum to the entered amount. No split is assumed when the share is unknown. The estimate uses the rule effective on the request date; existing payouts exclude snapshots created after the payout record, preventing later rule changes from rewriting their displayed historical split. Estimates exclude other fees and taxes, do not prove eligibility and never fill or confirm an actual deposit. Recorded gross results remain account performance; only actual confirmed net payout deposits reach Income. Rule fee metadata does not create an expense or recurring bill.

### Winning-day progress and matching accounts

The account register groups accounts whose settings, session aggregates, balances, payout states and current rule definitions match. This changes presentation only: UUIDs, histories and permissions stay separate. Expand **View / edit individual accounts** for individual controls, or use **Edit all** to preselect the matching group for a shared setup/rule correction. Names, masked identifiers and immutable version metadata do not determine grouping. Accounts separate automatically when their financial state or settings differ.

Winning-day progress sums net results after fees by each account's session-start date, including multiple copied trades once, and counts sessions at or above the configured qualifying-day threshold. Losses and zero sessions remain in recorded net profit. The current session can count but is labeled changeable. Future sessions and entries outside the tracking period are excluded. Each account must meet its own target; days never pool between accounts.

The period begins on the rule's optional `progressStartDate`, otherwise the activation date or rule effective date. Cycles are **not** inferred from deposit dates: adjust the period start after confirming a provider cycle reset. Payout estimates use positive recorded net profit minus recorded requested/approved/received payout amounts in the period, capped by the saved payout cap, then apply the configured share. Cancelled/rejected requests do not reserve funds. Missing rules/shares stay unknown, and partial combined estimates identify their coverage. These are conservative tracking scenarios, not eligibility decisions, guaranteed withdrawals, available cash or income; other provider restrictions may apply.

**Edit rule** opens saved values and saves an audited correction. `PATCH .../trading/accounts/:id/rules/:ruleId` checks household permission and account revision, rejects already-corrected or foreign rules, and atomically appends a replacement marked `supersedesRuleId`. Shared edits link each account's own prior rule. Old versions remain for audit and historical payout estimates. This uses the existing SQLite JSON snapshots and requires no destructive migration.

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


## Separate daily profit and loss

Daily summaries accept nonnegative profit, loss and fees in integer cents. Gross is profit minus loss; net is gross minus fees. Select one or multiple accounts, enter shared amounts once, explicitly apply them, then review or adjust each account before saving. Batch creation is atomic and idempotent. No result creates household income.

Migration 0020 only adds nullable profit/loss columns. Historical gross-only summaries and copied events retain an unknown breakdown until explicitly corrected; no historical split is inferred. Corrections can retain gross-only mode or supply a complete breakdown. Copied events continue using their existing signed gross fields and event correction workflow.

Daily-summary deletion requires current revision, confirmation and a reason. Permission checks, audit snapshots, submission retirement and deletion run in one transaction. Deleted summaries leave performance/goal totals; delayed retries cannot recreate them. Audit history remains in SQLite. Deleting a result does not cancel a payout or its Income deposit.

## Overview trading totals

The overview has a compact trading performance card scoped to the reporting month using recorded account session dates. It totals entered profit and loss separately, fees, and authoritative net results across household accounts. Manual summaries and copied account results count once by result ID. Historical gross-only entries are included in fees and net, while their unavailable profit/loss breakdown is clearly identified; partial profit/loss totals are labelled known. An empty month shows zero without creating transactions.

Payout records are not inputs to this calculation. Confirmed payout deposits remain in Income received through the existing income integration. This is a frontend presentation and shared calculation change; no database migration or API restart is required. Tests cover three-account aggregation, negative days, fees, duplicate records, month filtering, unavailable breakdowns, empty states and payout separation.


## Correcting copied results and fee-adjusted P&L

Results now provides Edit result on authorized copied entries, opening their existing event with its historical account membership. Each account can switch from signed gross mode to entered profit and loss. Revisions, ownership checks and the existing atomic event audit apply; result identifiers and payout records are preserved. Migration 0021 only adds nullable copied profit/loss and a fees-included flag (false for existing records). No historical amounts or breakdowns are inferred.

When P&L already includes trading fees, record fee-adjusted profit and loss and select that option. Additional fee deductions must be zero, enforced by shared API validation. The fee flag persists in SQLite and history says Included in P&L, rather than asserting the provider charged no fees. Optional additional fees apply only to amounts entered before fees. The provider profit split is applied only by existing advisory payout calculations, never again to recorded P&L or household income.


## Combine display and funded payout separation

Trading Combine accounts show a distinct evaluation panel: saved base profit target, consistency target, contract limits and recorded net results (or No results entered). They do not show the funded-account five-winning-day widget. Combine accounts are excluded from the combined funded payout estimate, and their individual payout estimate is unavailable even if a payout share was mistakenly saved. The evaluation panel does not claim passing, compute an official adjusted consistency target, or enforce trailing drawdown. Account plan rules remain editable database records; no account-specific presets or financial records are seeded into source.
