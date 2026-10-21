# Debt payment plans and bill arrears

## Workflow

- Debts → account actions → **Record settlement** opens the existing settlement form with the debt selected. An offer does not change its reported balance or imply acceptance.
- Goals → **Plan debt payment** saves a dated payoff target or references an existing monthly debt-linked bill. Drafts remain excluded from Smart Planner until the amount and schedule are confirmed.
- Smart Planner includes existing bills and confirmed debt schedules. Unreviewed imported debt balances/minimums are flagged for review rather than automatically scheduled as payments.
- Replacing contractual minimums or arrears requires current provider verification. Settlement substitutions additionally require accepted written terms. Personal goals cannot postpone settlement installments.
- Completed debt payments count toward a dated goal once, net of refunds. Existing obligations through the target date cover part of the goal; only the additional amount needed is planned. Pending and scheduled payments remain conditional.

## Bills register

- **Monthly Estimate** shows the saved regular fixed amount or variable estimate, normalized to a month for recurring bills.
- **Confirmed this month** and **Paid this month** refer to billing periods due in the current local calendar month. Only completed, effective payments count as paid. Future periods do not fill these columns.
- **Past due / still owed** sums unpaid overdue periods after completed payments and credits. Unconfirmed variable arrears remain explicitly estimated.
- **Bills remaining incl. estimates** includes only unpaid billing periods due in the current local calendar month, after completed payments and credits. Earlier arrears and future months are excluded from this card.
- **Upcoming month bills** shows next month's scheduled amounts, including saved estimates, excluding earlier carry-forward. The per-bill next-month column displays that carry-forward explicitly.
- **Next month** projects next month's due amounts plus earlier unpaid periods, with the two portions shown separately. Estimates and unknown amounts are labeled; the projection assumes those earlier amounts remain unpaid. Weekly/biweekly schedules include each due date. One-time bills never recur.
- Record payment lets the user select a billing period, its full remaining amount, or a partial amount. Confirming an actual variable bill and recording a partial payment preserves the recurring estimate. Each payment applies only to its selected period.

For example, a fictional $300 estimate, $342.18 confirmed bill and $200 completed payment leave $142.18 owed. If still unpaid, the next $300 estimated bill projects a $442.18 total. A missed $665 fixed bill plus the next $665 bill projects $1,330, without rewriting either period.

## Integrity and verification

Planning uses the existing SQLite JSON record storage, authenticated API, atomic request/review/audit transactions, revisions, source fingerprints and idempotency keys. No migration is needed. Owner-exclusive records remain protected; joint Owner records use approval requests. Stale linked bills or settlement revisions require reconfirmation. No planning action creates a real payment, expense, income transaction, balance reduction or debt forgiveness.

Verified with fictional data: confirmed/draft goals, settlements, linked monthly bills, duplicate coverage prevention, partial payments and carry-forward, month/year boundaries, weekly schedules, one-time bills, Owner/Admin/Editor/Viewer and cross-household permissions, and persistence after reopening plaintext and encrypted SQLite databases. The full suite passed 814 tests before the final next-month column; focused regression tests cover that addition. Lint, typecheck and production build are required before commit.

Real-account goal creation is performed only through the authenticated UI with user authorization. Personal account identifiers, balances, documents, screenshots and database files are excluded from source control.
