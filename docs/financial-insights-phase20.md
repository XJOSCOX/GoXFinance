# Phase 20 — Financial Insights

## Scope and architecture

Financial Insights is a local, deterministic, read-only analysis layer. It reuses purchase spending, refunds, debt grouping, reviewed payroll comparisons, Smart Cash Flow, Smart Planner, completed-bill patterns and asset/net-worth calculations. It never creates a second financial ledger. There is no paid AI service, remote analytics upload, financial-health score, tax-liability estimate or guaranteed financial outcome.

The new navigation page has Overview, Spending, Income, Debt, Cash flow and Action plans sections. Four key indicators appear first; other indicators and coverage are collapsed. Recommendations expose their observation windows, sample sizes, current/comparison values, methods, limitations, confidence and authorized source IDs. Source links open the appropriate existing module; use the displayed date and ID to locate the record. The dashboard shows at most three current recommendations, with repeated cash-risk types limited to one dashboard item.

## Calculation rules

All amounts are safe integer cents. Aggregates use `sumCents`, which rejects unsafe totals. Ratios use integer `BigInt` multiplication/division, rounded half away from zero to integer basis points (100 basis points = 1%). A zero or unknown denominator produces unknown. No missing upload is counted as a zero observation.

### Health indicators

- Received take-home: confirmed actual net deposits in the local current calendar month through today. Expected payroll, loan receipts and simulated trading P&L are excluded. Confirmed payout deposits enter through existing Income records only, once.
- Essential bills: dated full-month obligations from existing bill previews, using configured essential category names or verified Planner essential metadata. Fixed amounts and saved variable estimates retain their basis. Missing amounts invalidate this total. This is an observed configured set, not proof that all essential needs were entered.
- Debt minimums: one maximum reported minimum per verified duplicate obligation group. Known subtotal and unknown group count are disclosed.
- Debt pressure: full-month known minimums divided by received month-to-date **net** deposits. This is deliberately labeled as partial-month planning pressure, **not conventional gross monthly DTI**. Any missing minimum invalidates the ratio.
- Discretionary spending: recorded net purchases in explicitly named dining/entertainment/shopping/subscription/travel categories. Categories with no records remain unknown. Repayments and transfers are excluded.
- Purchases/income: same-window purchase spending divided by same-window confirmed net deposits. It is not a verified savings rate.
- Conditional inflow coverage: scheduled/estimated forecast outflows divided by modeled nonborrowed inflows over 90 days. Missing forecast data invalidates it; cash advances are never wages.
- Projected minimum cash: existing Planner forecast, unknown when incomplete. Opening cash, pending-debit treatment, installments and disclosed advances retain the existing safeguards.
- Achieved savings: unknown without independent verification. Manual goal contributions, a lower expense total, and accepted/completed plans are not evidence of cash saved.
- Emergency coverage: one same-day, nonfuture USD savings available-balance observation divided by configured monthly essential bills × 30. It is explicitly reported/cached savings coverage, not a certified emergency fund. Multiple accounts are not automatically summed because identity/asset overlap and timestamp compatibility need confirmation.
- Recorded net worth: existing Assets calculation with grouped liabilities, dated valuations, estimates and missing-data rules. It is not available cash or achieved savings.

The status is `pressure` when significant risks exist, otherwise `needs_information` if any indicator is unknown, otherwise `within_observed_plan`. It is not a credit score.

### Spending and recurring patterns

Month-to-date comparisons use equal day-of-month windows in the current and previous month. For March 31 against February, both windows end on day 28 (29 in a leap year); the displayed dates disclose this. Category trends require at least two observations per window and an absolute change of at least 10%, with a positive comparison denominator. Completed purchase refunds are netted; a linked debt bill/payment is a transfer, while a credit-card purchase counts as purchase spending once.

A current over-budget alert compares observed purchases with the full monthly limit. Persistent budget pressure requires the preceding three complete months, each with its own saved limit and at least two purchase/refund observations. Missing months do not qualify.

Merchant normalization uses Unicode NFKC, lowercase, letters/digits and whitespace. Same merchant/date/amount matches are **review candidates**, never automatic deletion. Recurrence requires at least three distinct dates. Weekly intervals use a 7±2-day median and ±2-day gaps; monthly medians 26–35 days with ±4-day gaps; annual medians 350–380 days with ±15-day gaps. Duplicate rows on one date do not strengthen cadence evidence. Annual history uses up to 1,120 days; other current merchant alerts require recent charges. Matching named bills are linked, never duplicated. Nondecreasing recurring amounts with a genuine increase produce a price-review insight, without assuming service/quantity remained unchanged. Multiple distinct recurring providers in an explicitly subscription/streaming category prompt purpose review, not a claim that either is unnecessary.

A merchant outlier requires five earlier purchases and a latest amount greater than twice their median. Completed-bill averages, changes and limited seasonal comparisons reuse Planner patterns. Seasonality requires at least 24 completed periods and the same month in at least two years; it is descriptive, not a future-price forecast.

### Employer-specific payroll

Only received actual deposits and reviewed linked statements support historical analysis. Net variability/trends require four distinct equivalent work periods of the same frequency and duration from one employer. The last eight comparable recorded deposits within 180 days supply median, mean absolute deviation/median and equal-half mean comparisons. Missing periods are not zero pay.

Latest current-period federal, Social Security, Medicare and retirement deductions are sign-normalized and kept separate from YTD. Actual net/gross is an effective take-home ratio, not a tax rate. Worked hours do not assume PTO is worked. Four equivalent reviewed statements can produce two-versus-two changes in regular/OT/PTO earnings, withholding and deduction lines. An absent component is unknown, not zero. Employer/source records are never pooled.

Forward accuracy requires at least three eligible saved predictions. The selected forecast must have been saved before document receipt, confirmation time **and before the calendar day of the actual deposit**. Reconciled-period and backtest-only forecasts are excluded. This conservative deposit-day rule may exclude valid same-day predictions. Reported error is mean absolute actual-minus-predicted net, rounded to cents. Payday timing uses at least three actual deposits and discloses the range against stated payday.

### Debt and cash risk

Verified balance trends require two distinct dated creditor-statement/reconciliation observations; manual adjustments and payment totals cannot establish principal reduction. Reported APR ≥20% creates a review prompt, not an assumed interest-savings amount. Card utilization requires a confirmed recorded balance, verification timestamp and positive reported limit. Known completed principal/interest/fee allocations can show cost pressure; allocations are described as reported, not inferred creditor balance changes.

Written accepted settlement installments due within 14 days or overdue receive urgent review; written unaccepted offers remain important/conditional. No eviction, disconnection or legal-enforcement outcome is inferred. Suggestions link to existing payoff comparison and Planner tools, protecting legal, housing and essential needs before optional extra payments.

Cash risks reuse the 90-day Planner/Cash Flow timeline and its warnings. Repeated daily risks of the same kind are grouped; dates, first occurrence value and number of **projected occurrences** are shown. Counts are not historical samples. Verified imminent essential gaps rank above discretionary optimization. Split-plan costs sum disclosed fees and interest for installments in the horizon; original-obligation replacement remains in the existing Planner. Advance repayment and disclosed fees stay separate from wages, with a review prompt after three recorded received advances in 90 days. No implied borrowing APR or automatic advance request is created.

## Feedback and action plans

Priorities are urgent, important, improvement, informational, in that order; ties prioritize essential funding, written settlement deadlines, cash flow and debt before other review prompts, then sort by stable identifier. Feedback is actor/household scoped. Useful marks are presentation metadata. Dismissing urgent or important risks does not hide them or change an obligation's payment state. Other dismissed recommendations leave the current presentation. The endpoint supports resetting feedback.

Action plans are optional nonfinancial metadata. Status can be planned, in progress, completed or dismissed. Review-only actions need no dollar estimate. A spending-reduction scenario is offered only for an observed discretionary category with a positive remaining saved allowance, no category bill and no future recorded category purchase. It starts today and ends within the current calendar month. Baseline explicitly adds the remaining allowance to the existing forecast; proposed subtracts the user-selected reduction. Neither writes a budget or alters an actual purchase. Potential improvement is the change in modeled minimum cash, unknown if either scenario is incomplete. Reductions are bounded by the stated allowance; missing expenditure coverage may make the allowance optimistic.

Accepted dates, reduction assumptions and original context remain immutable; lifecycle status and notes can change with revision checks. There is one plan per recommendation/actor; new dated recommendations can support new plans. Existing plan assumptions are not silently rebased. Future recorded actual category spending is tracked from acceptance, excluding pre-acceptance same-day records and counting no missing period as zero. Same-day refunds are conservatively excluded because their available view lacks a receipt timestamp. Review-only plans have no spending target. A plan marked completed still has **unverified achieved savings**.

Any authorized source/settings/date change marks the saved scenario historical/stale; live insights are recalculated. A deleted/voided or no-longer-authorized referenced source hides the saved plan and audit response. This intentionally conservative authorization can hide a plan after an unrelated source in the saved assessment is removed. Original audit context is retained, not rewritten.

## Permissions, storage and compatibility

- Authentication, same-origin write/CSRF and existing household access checks apply to all endpoints.
- Non-Owners are scoped **before aggregation** to their assigned/shared bills, debts/assets/bank accounts, their own expense/income/payroll sources, member-scoped budgets and visible self-created planning metadata. Owner-level opening cash and general reserves are not exposed to them. Restricted totals are labeled as partial authorized scope.
- Source reference authorization is rechecked for live explanations and every saved-plan/audit read. Feedback/plans are private to their actor. Cross-household access returns not found; Viewers cannot write metadata. Owner-level saved context requires continued Owner access.
- No raw paystub documents, bank account numbers, credentials or access tokens enter insight snapshots or logs. Snapshots contain the recommendation, scenario input/result and authorized record IDs only; original documents remain in the existing payroll workflow.
- Additive migration `0035_gorgeous_patch` creates only `insight_records` and `insight_audit`, with household/user foreign keys and scoped uniqueness. Immutable audit and original-context triggers protect saved evidence. Immediate SQLite transactions couple metadata updates with audit insertion. Fingerprint/revision/idempotency conflicts reject stale or conflicting requests.
- Plaintext and encrypted SQLite use the same schema. Existing encryption/key handling, backups, ledger tables, legacy forecast snapshots and Plaid configuration remain intact. Plaid Production is not enabled.
- No real database is seeded, reset, restored or migrated during QA. Fixtures use temporary databases and the browser demo uses `data/phase20-fictional-ui*.sqlite` with its own cookie on port 1421.

## Verification

Targeted synthetic tests cover missing/known indicators; equal partial windows; exact ratios/overflow; net refunds; card purchases versus repayments; action windows; distinct-date recurring/annual patterns and price changes; merchant spikes; persistent budgets and seasonal bill evidence; employer separation; current withholding/retirement; forward forecast error without look-ahead; debt verification; reserves/shortfalls; split/advance costs; multiple/future savings observations; risk grouping; local-date/UTC evaluation; metadata-only actions; positive and unknown scenario impacts; revision/idempotency; source corrections/voiding; scoped and cross-household access; Viewers/CSRF; atomic rollback; immutable evidence; restart; disposable restore and encrypted backup verification.

The migration preservation test also upgrades the exact pre-Phase-20 schema in both modes and compares all existing rows, foreign keys, integrity and verified safety backups. UI tests cover collapsed evidence, permission controls, preserved feedback with an existing plan and re-preview after input edits. Browser acceptance covers fictional login/navigation, dashboard links, scenario preview/acceptance, plan state/audit and responsive layout.

Final command results and remaining build notices are recorded below after the regression gate.

## Manual acceptance checklist

Use a separate fictional household/database on localhost:1421:

1. Open Financial insights; verify an empty account displays unknown values and no score.
2. Record purchases in equivalent current/prior windows, a refund and a linked-card repayment. Confirm net purchases count once and missing windows do not become zero.
3. Enter three distinct recurring charges and an existing bill with the same provider; verify a bill link, no automatically created bill, and review-only duplicate/price prompts.
4. Review four comparable actual paychecks from one employer and another from a different employer. Check distinct trends/current deductions and no summed YTD. Predictions saved after receipt/deposit must not improve accuracy.
5. Add two verified creditor balances and known APR/limit data; compare against unverified values and review essential priorities and written settlement dates.
6. Confirm dated opening cash, reserve and obligations in Planner. Compare grouped shortfall/buffer dates; verify split fees and advance repayments are not wages or duplicate original bills.
7. Open a discretionary allowance insight, preview a reduction, change it and verify a new preview is required. Accept it; confirm no bill, payment, expense, income or budget changes.
8. Add later actual purchases, change status and inspect immutable history. Confirm achieved savings remains unverified. Edit a source and verify stale historical labeling/live recalculation; void/revoke it and verify access protection.
9. Dismiss a significant risk; it remains visible. Sign in as a restricted member/Viewer and verify private evidence and write controls are unavailable.
10. Test at 390px/mobile and desktop; expand evidence, navigate tabs and close the modal with Escape. Restart the isolated API and verify persistence and existing forecast history. Restore only a disposable backup, never the real runtime database.

## Limitations

This is planning software, not licensed financial advice. It cannot know unrecorded expenses, creditor policies, service purpose, true annual taxes or future income. Category/merchant normalization is heuristic and bilingual/renamed providers can require manual review. Current gross-income DTI, generalized seasonal models, automatic rescheduling/cancellation, automatically rebased accepted plans and verified achieved-savings attribution are deliberately not invented. Saved spending scenarios are limited to the current month and accepted assumptions cannot be edited. Source links open existing modules with displayed IDs/dates rather than introducing new ledger-detail screens. Data remains local; no new notification or background scheduler is installed. Existing bundle-size/dependency annotation notices may remain in the production build.

## Implementation file inventory

New shared contracts/calculations and synthetic tests:

- `packages/shared/src/insights.ts`
- `packages/shared/src/insight-engine.ts`
- `packages/shared/src/insight-spending.ts`
- `packages/shared/src/insight-income.ts`
- `packages/shared/src/insight-debt.ts`
- `packages/shared/src/insight-cash.ts`
- `packages/shared/src/insight-statistics.ts`
- `packages/shared/src/insights.fixture.ts`
- `packages/shared/src/insights.test.ts`
- `packages/shared/src/insight-income.test.ts`

New API and interface:

- `apps/api/src/modules/insights/insights.permissions.ts`
- `apps/api/src/modules/insights/insights.repository.ts`
- `apps/api/src/modules/insights/insights.routes.ts`
- `apps/api/src/modules/insights/insights.service.ts`
- `apps/api/src/modules/insights/insights.test.ts`
- `apps/web/src/features/insights/InsightsPage.tsx`
- `apps/web/src/features/insights/InsightCard.tsx`
- `apps/web/src/features/insights/InsightPlanModal.tsx`
- `apps/web/src/features/insights/OverviewInsights.tsx`
- `apps/web/src/features/insights/useInsights.ts`
- `apps/web/src/features/insights/insights.test.tsx`

New additive schema and documentation:

- `packages/db/src/schema/insights.ts`
- `packages/db/migrations/0035_gorgeous_patch.sql`
- `packages/db/migrations/meta/0035_snapshot.json`
- `docs/financial-insights-phase20.md`

Existing integration files modified:

- `apps/api/src/app.ts` — register the service with existing source repositories.
- `apps/api/src/modules/forecasts/forecast-migration.test.ts` — add exact pre-Phase-20 preservation checks in both database modes.
- `apps/web/src/app/App.tsx` — protected Insights route.
- `apps/web/src/components/layout/WorkspaceSidebar.tsx` — navigation entry.
- `apps/web/src/features/dashboard/pages/DashboardPage.tsx` — compact dashboard summary.
- `packages/shared/src/index.ts` and `packages/db/src/schema/index.ts` — exports.
- `packages/db/migrations/meta/_journal.json` — additive migration registration.

## Final results — October 21, 2026

- `npm --script-shell=cmd.exe run lint`: passed.
- `npm --script-shell=cmd.exe run typecheck`: passed (also rerun by the build).
- `npm --script-shell=cmd.exe run build`: passed. Existing large-chunk and upstream Zod annotation notices remain; no build errors.
- `npm --script-shell=cmd.exe test -- --maxWorkers=2`: **881 tests across 213 files passed**, including 31 added cases over the Phase 19 baseline. Final run: 204.55 seconds. No assertions or test timeouts were weakened. An initial default-concurrency run alongside the build hit native encryption/process timing limits; isolated low-concurrency runs passed.
- Plaintext/encrypted additive migration, all prior row preservation, foreign keys, SQLite integrity, immutable context/audit, restart and disposable encrypted recovery checks passed.
- Browser QA on the separate fictional localhost:1421 fixture: navigation/dashboard links, essential-first ranking, significant-risk dismissal retention, $50 scenario preview/acceptance, lifecycle edits and revision history passed. The saved fictional comparison moved modeled minimum cash from −$490 to −$440 while achieved savings remained unverified.
- Desktop tested at 1280×900; mobile at 390×844. Mobile document width was 380px within the 390px viewport. Temporary viewport overrides were reset. Desktop/mobile screenshot artifacts were saved outside the repository.
- After QA completed, the normal encrypted launcher was restarted without requesting or displaying the passphrase. Startup created and verified one new encrypted pre-migration backup before applying the additive metadata tables. Website returned HTTP 200; the new Insights endpoint returned HTTP 401 without a session, confirming it is present and protected. No real financial records were seeded, reset, restored or edited.

For review, open **Financial insights** in the normal app's sidebar. Use the fictional QA site for experiments and follow the manual checklist above. No subsequent feature phase was started.
