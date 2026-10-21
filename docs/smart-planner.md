# Smart Planner — Phase 18

Status: implemented and tested; pending user acceptance. Automated checks do not establish production stability.

## Features and organization

- Smart Planner appears under Plan & build, with links from Bills and Cash Flow. Available money, conditional paychecks, protected reserves, critical/essential obligations and deadline funding gaps appear first. Details, calendar/scenarios, terms/allocations, local insights and immutable saved plans are separate views.
- `packages/shared/src/planner*.ts` contains strict inputs, deterministic calculations, payment linking, priorities and pattern summaries. It extends the Phase 17 event engine rather than creating another ledger.
- `apps/api/src/modules/smart-planner` separates repository, permissions, validation, service transactions and routes. `apps/web/src/features/smart-planner` reuses FinancialEditor, Modal, entry fields and existing cash-flow components. No additional CSS framework or external analysis service is used.
- Additive migration `0034_wet_the_call` adds planning records, review requests, audit and scenario snapshots. Existing financial tables are unchanged. Household/user foreign keys, unique submission keys, immutable audit/snapshot triggers and one-way review transitions protect history.

## Available cash and timing

“Update available balance” creates an existing bank balance observation plus linked planning metadata in one immediate transaction. Fields include account, available USD cents, effective time, IANA time zone, source, pending inclusion and notes. Wall-clock entries are converted using the selected zone, independently of the browser zone. Invalid and ambiguous clock-change times are rejected rather than silently shifted. A manual report is never labelled a live verified institution balance. Reconciled reports require evidence; claiming verified-connected provenance through the manual endpoint is rejected.

After recording an account observation, use Confirm cash / buffer to select the nonoverlapping account balances or attest an aggregate cash amount. Nothing becomes opening cash silently. Selected accounts must be visible, active USD cash accounts with current manual observations. Credit-card limits, investment/nominal trading values and loans are excluded. Duplicate account UUIDs, duplicate asset mappings and likely duplicate institution/mask identities are rejected. Multiple observations must be within five minutes of each other; otherwise update them before aggregation. This is a conservative compatibility rule, not a claim that account transactions occurred simultaneously.

Phase 17 excludes recorded activity explicitly captured in opening cash and older cash events. Date-only activity on the effective date is uncertain unless the user confirms inclusion. Later actual activity is applied once. Captured pending holds identify existing pending payments and their amounts: subsequent settlement applies only the change from the included hold. Cancelled/removed holds require a fresh balance because release timing is unknown. Pending holds cannot be attributed to two account observations. Transfers are not new Income or spending; existing reconciliation keeps transfers outside the authoritative cash-outflow ledger.

Separate cash accounts are not treated as instantly transferable. A specified payment account must match its cash source, or an explicit allocation must identify where a conditional paycheck will be deposited. With multiple accounts and an unknown debit account, the planner does not allocate cash as if all accounts were interchangeable. Subsequent actual activity without reliable account attribution makes account-level allocation require refreshed observations. Negative available cash is a deficit, not overdraft capacity.

## Priorities and allocation

Suggested ranks are critical, essential, important, flexible and optional. Housing and child-support labels suggest critical review; utilities, food, healthcare, transport, childcare and communications suggest essential review. These label-based suggestions do not establish legal consequences. Ordinary collections remain important rather than automatically being labelled flexible. Recorded APR, verified deadlines, late fees, collateral/service risks, essential status and explicit household overrides supply the explanation.

Court/legal orders, disconnection, eviction/housing, repossession, judgment and other serious consequence claims require evidence and verification time. Verified court obligations remain critical even if an allocation tries to lower their rank. Expired evidence is flagged. Verified grace days are recorded and explained, but never automatically move an actual due date. Partial reserves are never represented as legally sufficient unless acceptance is verified. Actual obligations remain visible after a recommendation is dismissed.

The engine protects the safety buffer, essential living reserve and accepted reserves first. Optional integration uses remaining household food/transport/health/supplies category limits for the starting month, excluding categories already covered by bills or explicit reserves. Budget limits are reserves, not additional completed spending. Explicit savings, sinking funds, emergency and extra-debt allocations can link categories and existing goals. Per-paycheck reserves reduce the selected conditional funding lot. No allocation creates an Expense, Income, contribution, bill payment or bank transaction.

Recommendations are ordered by priority and deadline. Conditional paychecks arriving by a later bill's deadline are considered before consuming current cash needed earlier; funds arriving after a deadline cannot satisfy it on time. Confirmed allocations never exceed known spendable cash after protected reserves. Funding identifies available cash, documented pending deposit, saved forecast, explicit assumed paycheck, or hypothetical borrowing. Unknown amounts, deficits and unallocated obligations stay visible. Accepted amount/source overrides retain their reason and revision. A funding gap is not hidden by dismissing a recommendation.

## Split payments, BNPL and settlements

Plans link an existing bill period or debt. They store original amount, financing/down payment, principal/fees/interest per installment, dates, status, explicit coverage and verified agreement evidence. Installment principal must reconcile to the original amount; financing plus down payment must reconcile as well. Down payments are represented within the schedule and linked existing payments, never deducted again as a separate automatic debit.

Only a verified accepted/active/completed arrangement with explicit replacement terms suppresses the original covered schedule. Proposed, cancelled, defaulted or expired evidence does not silently replace it. Competing active terms or accepted settlement agreements are rejected. Existing accepted settlements are included in the planner without an optional activation step; their existing authoritative payments remain canonical. A settlement does not automatically erase any larger contractual requirement unless that effect is documented in the underlying records.

Existing BillPayment and DebtPayment records remain authoritative. Installments display completed, pending, scheduled, overdue and remaining amounts; cancellation restores their remaining obligation. A payment can link to one installment only. New unlinked payments or changed bill amounts/credits stop installment substitution and prompt reconciliation rather than creating an additional installment deduction. Linked bill/debt aliases continue to count once. BNPL requires the existing credit-card/deferred-cash purchase Expense and the same debt: the purchase is spending once; installments affect cash once. No liability is automatically marked settled from a cash payment with unknown principal allocation.

## Advances and payroll

Advances link an existing dedicated debt liability. The planner does not create a duplicate debt or classify principal received as earned Income. Confirmed receipts are borrowed/accelerated cash events, excluded from Income totals. Fees, optional tips and expedited charges are separate; disbursed cash and repayment reconcile depending on whether costs are withheld or repaid later. An unreceived advance provides no available cash.

Bank-debit repayments use existing authoritative debt payments, including newly recorded payments for that dedicated debt since receipt. Remaining repayment deducts completed, pending and scheduled coverage once. Payroll deductions require an existing employer/source and its payroll period. When repayment is already included in net, no second bank debit is projected. An explicitly pre-deduction saved forecast is reduced once; a later reviewed/confirmed net replaces it without another subtraction. Unknown net treatment makes the projection incomplete. Mixed deduction treatments on one period require review.

A user may acknowledge actual payroll repayment only after the linked paystub is reviewed and its Income deposit is confirmed. Full acknowledgement permits completing the advance; the existing debt balance must be reconciled separately through Balance History when principal allocation is known. The planner never fabricates a debt-payment bank debit to represent payroll withholding.

Advance pressure flags multiple repayments on payday, repayments above 25% of expected take-home (an explicit review heuristic, not a provider rule), receipts within seven days of another repayment, disclosed costs and conflicts with essential obligations. The planner suggests verifying terms, reducing optional assumptions and contacting providers early. It never requests an advance, assumes provider flexibility, or recommends borrowing as the default remedy.

## Scenarios, patterns and privacy

The existing payroll priority stays authoritative: confirmed deposit, reviewed pending statement/linked pending Income, latest saved source/period forecast, then explicit assumptions. No hypothetical hours or future salary are invented. Employer sources remain separate, including military versus hourly payroll. Source-level privacy is reused.

Scenarios include 1–5 day delays, smaller paychecks, unexpected expenses/utilities, contractual minimums versus extra debt, changed discretionary spending/reserves and explicit hypothetical advances with their repayment/fees. Simulations change only preview inputs; saved plans preserve sources, inputs, fingerprint and report. They do not change real dates, agreements, transactions or deposits.

Local descriptive patterns require at least three completed bill periods, observed completed spending months or confirmed source-specific paychecks. Recent bill changes require six periods. Same-month seasonal comparisons require at least 24 completed periods and two distinct years for that month. Samples/confidence/basis are disclosed. Missing uploads/months are not zero. Prior late payments never establish permission to pay late; prior provider arrangements are not assumed renewable. Household/source isolation applies to patterns and saved reports.

## Permissions and atomicity

- Owner controls household cash observations and general reserves. Viewers cannot write. Other authorized members can manage their own regular obligations.
- Owner-exclusive obligations cannot be managed by other members. Sensitive Owner-linked joint planning changes become pending requests; proposed values have no effect until Owner approval.
- Submit, approve, reject, cancel, record update and audit writes are immediate SQLite transactions. Approval rechecks current permissions, target revision and a household source fingerprint. A changed source makes a request stale; the user must reject/resubmit it. Duplicate approvals and retries cannot create duplicate records.
- Every reference is checked against the same household and current source permissions. Private employer/account/goal planning data and historical snapshots are hidden if the viewer no longer has access. No invitation secrets, banking credentials or encryption secrets enter planning audits.

## Verification

Only synthetic records were used in automated tests and localhost:1421 browser QA. No real financial records were altered for testing.

- Full regression suite: 786 tests across 197 files passed. Final integration coverage adds the planner/cash-flow shared-fingerprint regression; final targeted run: 61 tests passed.
- Lint, typecheck and production build passed. Existing bundle-size advisory remains; upstream Zod annotation warning does not fail the build.
- Plaintext and encrypted tests cover persisted observations, records, approvals, immutable snapshots, backups/restart and integrity/foreign-key checks. Migration preservation compares every pre-existing table's rows, including the exact Phase 17-to-18 transition, and verifies the pre-migration backup.
- Practical example: $900 available, $800 expected Friday, $1,000 verified split rent ($550/$450), $130 utility, $80 phone, $120 advance repayment, $75 card minimum and $100 grocery reserve. Obligations total $1,405; conditional ending cash $295; $100 stays reserved. Delaying payroll two days leaves $80 unfunded by the Friday deadlines with all obligations retained. Borrowed principal is excluded from earned income.
- Browser QA saved a fictional $900 checking observation, explicitly confirmed it as opening cash, saved a $100 grocery reserve and reviewed a $300 electricity allocation. A $200 hypothetical utility increase and $50 additional reserve exposed a $50 deadline gap without modifying the saved bill.

- The fictional saved plan and its allocation gap were retrieved after the isolated QA API restarted; saved views use their captured inputs and report rather than current opening cash.
- Desktop (1440px) and mobile (390px) browser checks passed; the mobile page and balance dialog had no horizontal overflow. The normal encrypted API restarted successfully through the existing launcher after the additive migration.

## Limitations and manual acceptance

No real payment processing, provider/legal verification, cloud analysis or live bank connection is performed. Unknown account attribution and cash timing require user confirmation. Fee percentages are descriptive, not APR calculations. Acknowledging payroll withholding does not invent a bank transaction or automatically reconcile creditor principal. These safeguards deliberately leave unsupported assumptions incomplete.

Before treating the planner as stable, review in the app:

- [ ] Confirm available cash, time zone and pending-inclusion choices for each account.
- [ ] Check the priority and evidence for housing, court/legal and collection obligations.
- [ ] Review a verified split plan, linked partial payment, remaining amount and original-schedule replacement.
- [ ] Review one BNPL purchase and its authoritative installment payments without duplicate spending.
- [ ] Review both bank-debit and payroll-deducted advances, including fees and repayment pressure.
- [ ] Reserve amounts from a specific paycheck; edit/dismiss with a reason and inspect the audit.
- [ ] Compare baseline, late/smaller payroll, utility increase and hypothetical advance scenarios.
- [ ] Submit an authorized joint-obligation edit as Admin/Editor; approve/reject as Owner and verify stale requests fail.
- [ ] Inspect the calendar and saved plan on desktop/mobile, then refresh/restart and confirm persistence.
