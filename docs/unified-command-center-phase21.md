# Phase 21 — Unified Financial Command Center

## Delivery scope

The existing `/dashboard` Overview route is now the Financial Command Center. No payment processing, external AI analysis, Plaid Production change, or new ledger was added. All destructive and mutation QA used disposable fictional households. Real financial records were not edited.

## Architecture and sources of truth

- `GET /api/households/:householdId/command-center?month=YYYY-MM` returns the Zod-validated `schemaVersion: 1` response. Dashboard initialization, focus/visibility refresh and manual Refresh call this GET only. The previous dashboard POST to refresh bill periods was removed.
- The existing Insights authorization context scopes all sources before calculation. One `smartPlanner` result supplies funding, obligations, reserves and its 90-day forecast; `financialInsights` receives that prepared result instead of computing another timeline.
- Shared `incomeSummary`, `cashOutflows`, `budgetSpending`, goal progress, verified debt observations and Planner outputs remain authoritative. There is no new financial-pattern engine or payment ledger.
- Bill analysis batches household periods/payments/members and reuses `billPeriodView` and `billBudgetEstimate`. Expense allocations, debt member assignments, payroll statements/lines, balance observations and linked refunds use batched reads. Read-only analysis methods avoid per-record mutation-permission lookups and unused bank transaction loading. Goal rows are scope-filtered before computing their progress. Goal progress can reuse the already loaded financial sources, and empty goal lists do not reload them.
- The new `command_preferences` table is display metadata only. Actor/household-scoped immutable revisions, submission keys and timestamps retain preference history. PUT uses CSRF protection, optimistic revisions, atomic writes and replay checks. It never writes balances, transactions or Planner settings.
- The dashboard hook uses a single summary request, avoids persistent browser storage and periodic polling, coalesces focus/visibility events, and cancels obsolete responses on navigation. Returning from existing financial workflows remounts/refreshes the view.

## Components

- `CommandSummary`: dated available cash, next conditional paycheck, known 7/14-day essentials, unknown amounts and projected cash.
- `CommandActions`: ranked grounded actions, source links and expandable explanations; compact desktop grid and mobile list.
- `CommandObligations`: remaining, original due date, paid amount when recorded, planning date, priority and conditional funding. Near-term/overdue dates precede distant periods. Full details remain in Planner.
- `PaycheckFunding`: reported period/hours, expected gross/net, review status and source-specific conditional allocations.
- `CommandTimeline`: expandable 14/30-day dates with existing cash-flow events and buffer breaches.
- `CommandProgress`: received income, cash outflows, budget allocation/assigned/unallocated, actual spending, essential funding, computed goals and verified debt changes.
- `CommandSettings`: period, compact presentation, expanded sections, quick actions and indicators. Buffer changes open the existing Planner form.
- The Overview route also shows up to three current Insights and progressive source-coverage details.

## Financial accuracy decisions

### Status and time windows

- Available cash is a **dated user report**, never a live bank-verified balance. No snapshot means Unknown. A report over 24 hours old is stale; changed/revoked selected account observations require reconfirmation. Future-dated cash is not eligible.
- An incomplete forecast or ineligible cash confirmation suppresses projected cash amounts and timeline balances. Last reported cash remains separately labeled in source details. Cash-dependent Insights disclose the need for reconfirmation and suppress stale numeric gap claims. Underlying Planner assumptions are preserved rather than rewritten.
- The accounting month controls actual received income, cash paid and spending. Next payday, actions and timeline remain relative to today. Expected income and overall funding use the shared 90-day planning window; the UI states its end date. These windows must not be added together.
- An expected income total is Unknown if any contributing paycheck amount is unknown; a separately labeled known subtotal and unknown count are available. Unknown obligations retain null amounts, with known essential subtotals labeled separately.
- No health score, achieved-savings claim or inferred debt principal reduction is generated. Debt progress requires two existing dated verified observations from Financial Insights.

### Actions

1. Verified legal/serious-consequence constraints from Planner.
2. Imminent essential gaps.
3. Other existing obligations due soon.
4. Missing information preventing reliable planning.
5. Payroll review and supported statement milestones.
6. Spending/budget review.
7. Optional debt optimization.

Ties use relevant recorded dates, confidence and stable IDs. Dollar amounts do not override serious constraints. This is a review order, not an optimal payment algorithm. Essential-gap Insights merge into their corresponding obligation action. Analysis-window end dates are not presented as payment deadlines. Compact preferences cannot hide tier-zero actions.

### Payroll, obligations and allocations

- An existing reported payroll period is required for its forecast. No future hours are fabricated. A configured statement milestone and absence of a reviewed statement are required for an upload reminder.
- Reviewed pending statements replace estimates. Confirmed deposits replace pending amounts using existing payroll/Income linkage. Deposit confirmation remains an explicit Income action.
- Split rent, linked debt bills, advances, accepted settlement payments and **confirmed debt plans only** reuse Planner's deduplication and eligibility rules. Draft debt plans never become obligations through this dashboard.
- Allocations use the next paycheck's existing Planner funding ID. Allocated, held and remaining amounts reconcile to that funding source. Unknown paycheck amounts do not become zero-dollar funding sources. Reservations are not payments or actual spending.
- Timeline events reuse stable shared event IDs; daily totals imply no intraday payment order. Confirmed, scheduled, estimated, conditional and unknown states are distinguished.
- Only received trading payout deposits can enter confirmed Income through the existing ledger. Combine P&L and nominal funded-account balances are not available cash.

## Permissions, privacy and persistence

Authentication/active household membership is checked before source loading. Private payroll, expenses, bills, debts, budgets, assets and evidence are scoped before analysis. Owner-only opening cash/reserve settings are not loaded for other roles. Banking visibility uses the existing banking service. Raw paystub documents, account numbers, access tokens and source snapshots are absent from the response.

Viewer display preferences are personal metadata and may be saved; financial mutation shortcuts are hidden. Existing forms retain server-side access and Owner approval rules. Foreign origins, stale preference revisions, conflicting submission replay and cross-household/nonmember requests are rejected.

The additive migration creates only preference metadata/indexes/immutability triggers. Existing verified pre-migration backups, encrypted SQLite unlock, snapshots and recovery behavior are retained. Tests compare all preexisting financial tables before and after repeated dashboard GETs, preference changes and API restart. Prior-schema migration tests preserve existing scenario JSON unchanged.

## Performance measurements

Measured on October 22, 2026, Windows `10.0.26300`, AMD Ryzen 9 9950X, Node `v22.18.0`, local plaintext SQLite. Fastify injection includes authentication, source loading, computation, response validation and JSON serialization; it excludes browser/network overhead. Two warmups followed by 20 sequential measured requests; no performance threshold was substituted for an assertion.

Synthetic fixture: three users; 54 payroll periods spanning more than 12 months with reviewed statement lines and historical deposits; 480 expenses; eight recurring bills; eight debts; four confirmed plans; 12 budget-history rows; 60 Insights feedback-history rows.

| Measurement                 | Final result |
| --------------------------- | -----------: |
| Minimum                     |     19.78 ms |
| Median                      |     21.64 ms |
| 95th percentile             |     24.17 ms |
| Maximum                     |     25.15 ms |
| Largest serialized response | 46,957 bytes |

An earlier run before removing repeated source loading measured 219.77 ms median / 270.14 ms p95. An intermediate batched-loader run measured 137.32 ms median / 154.65 ms p95; the final read-only context reuse removed the remaining per-record permission reads and unused bank transaction loading. Final numbers above use that loader. Reproduce from PowerShell:

```powershell
$env:GOX_COMMAND_BENCH='1'
npm --script-shell=cmd.exe test -- apps/api/src/modules/command-center/command-performance.test.ts --maxWorkers=2 --silent=false
```

The benchmark is opt-in and uses a temporary database. Normal tests skip it. Response limits: 100 actions, 40 obligations, three Insights, eight goals, ten verified debt changes, 30 timeline days, 20 coverage messages. Truncation counts and links provide access to full underlying modules. The shared computation horizon is bounded to 90 days. Existing household history is retained for payroll/Insights comparisons; it is not truncated into fabricated completeness. Very large historical households may still need future query-window optimization.

## Validation evidence

- Automated: empty/complete summaries; authoritative accounting and budgets; expected versus confirmed cash; early/delayed payroll; reviewed/confirmed replacement; unknown payroll; stale/missing/changed multi-account cash; three competing critical obligations; overdue/unknown obligations; split rent, linked debt and advance deduplication; reserve preservation; per-paycheck allocation reconciliation; configured milestone reminders; single prepared Planner calculation; source privacy; viewer controls; dismissal/significant-risk retention; CSRF; revision/replay; no financial writes; plaintext/encrypted restart, backups and prior snapshot compatibility.
- Browser QA: isolated fictional site at `localhost:1424`, separate database and session cookie. Upload, estimate and available-balance shortcuts opened existing dialogs without saving financial changes. Display preferences persisted across isolated API restart. Desktop 1440×1000 and mobile 390×844 had equal DOM client/scroll widths (1430/1430 and 380/380, excluding scrollbars); mobile tiles stack into two columns and navigation collapses.
- `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` passed. Full suite: **218 files passed; 904 tests passed; one opt-in benchmark skipped**. The benchmark was separately executed and passed. The final loader refinements also passed 29 focused API/permission/Planner regressions before the final complete rerun. Final date/stale-risk presentation refinements passed another 16 focused tests.
- Production dependency check: `npm audit --omit=dev --json` returned **zero known vulnerabilities**.
- Source-control secret scan: 989 tracked/new text files scanned for private keys, AWS, GitHub, OpenAI, Slack and Plaid live-token patterns; zero high-confidence findings. Tracked `.env` secrets, databases, PDFs and key archives were separately checked and absent. This pattern scan is not an entropy-based guarantee or a scan of all historical Git objects. Ignored local documents, databases and environment values were not read or staged.
- Normal encrypted app startup passed with the saved environment unlock and no interactive prompt. The new endpoint returned 401 without a session. The real browser was signed out; no private financial values were read or changed for runtime verification.
- Build emits existing Rollup annotation warnings from Zod and a large application-bundle warning (approximately 1.23 MB minified / 340 KB gzip). Build succeeds; no warning thresholds were weakened.

## Known limitations

- Cash freshness is a conservative 24-hour presentation policy. Planner retains historical assumptions for explicit review; the Command Center does not silently update them.
- Recommendations depend on reported records and verified terms. They do not verify provider acceptance, establish legal consequences, execute payments or forecast unreported hours.
- The response is atomic: a database/source failure produces a retryable error instead of silently dropping financial sources. Authorized incomplete sources retain explicit Unknown/coverage states.
- Individual expansion toggles are session presentation; customize expanded defaults to persist them. Preferences are per user and household, not shared household financial settings.
- Benchmark results describe the local synthetic environment, not concurrent-user or remote-network guarantees. Large histories and the existing client bundle remain future optimization opportunities.

## Manual acceptance checklist

1. Open Overview; compare cash date/source and Unknown/stale handling with the current Planner confirmation.
2. Compare the next reported paycheck and its period, gross/net and receipt state with Income; verify no invented payroll period.
3. Compare 7/14-day essential amounts, overdue bills and confirmed debt plans with Bills/Planner. Check original and split obligations count once.
4. Review ranked actions; serious verified constraints remain visible when compact mode is enabled.
5. Expand funding; verify allocated + held + remaining equals the known paycheck source, with receipt still conditional.
6. Expand 14/30-day timeline; check dates and classifications with Smart Cash Flow and review buffer breaches.
7. Compare current Insights and progress with their source modules; missing data stays Unknown, debt changes use verified observations.
8. Open upload, estimate and balance shortcuts; cancel them without changing financial records.
9. Customize display preferences; refresh/restart and verify persistence and actor isolation.
10. Repeat as a restricted member and Viewer, then on phone/tablet/desktop; verify no Owner cash/private payroll leaks or horizontal overflow.

## Source inventory

Phase 21 source, synthetic tests, schema metadata and this document follow. No runtime data or screenshots are committed.

- `apps/api/src/app.ts`
- `apps/api/src/modules/banking/bank.repository.ts`
- `apps/api/src/modules/banking/bank.service.ts`
- `apps/api/src/modules/bills/bill.repository.ts`
- `apps/api/src/modules/bills/bill.service.ts`
- `apps/api/src/modules/command-center/command-performance.test.ts`
- `apps/api/src/modules/command-center/command.repository.ts`
- `apps/api/src/modules/command-center/command.routes.ts`
- `apps/api/src/modules/command-center/command.service.ts`
- `apps/api/src/modules/command-center/command.test.ts`
- `apps/api/src/modules/debts/debt.repository.ts`
- `apps/api/src/modules/debts/debt.service.ts`
- `apps/api/src/modules/expenses/expense.repository.ts`
- `apps/api/src/modules/expenses/expense.service.ts`
- `apps/api/src/modules/forecasts/forecast-migration.test.ts`
- `apps/api/src/modules/goals/goal.service.ts`
- `apps/api/src/modules/income/income.service.ts`
- `apps/api/src/modules/insights/insights.service.ts`
- `apps/api/src/modules/overview/overview.repository.ts`
- `apps/api/src/modules/payroll/payroll.repository.ts`
- `apps/web/src/app/App.test.tsx`
- `apps/web/src/features/command-center/CommandActions.tsx`
- `apps/web/src/features/command-center/CommandDetails.tsx`
- `apps/web/src/features/command-center/CommandSettings.tsx`
- `apps/web/src/features/command-center/CommandSummary.tsx`
- `apps/web/src/features/command-center/command-center.test.tsx`
- `apps/web/src/features/command-center/command-quick-actions.ts`
- `apps/web/src/features/command-center/useCommandCenter.ts`
- `apps/web/src/features/dashboard/pages/DashboardPage.tsx`
- `apps/web/src/features/income/pages/IncomePage.tsx`
- `apps/web/src/features/smart-planner/pages/SmartPlannerPage.tsx`
- `docs/unified-command-center-phase21.md`
- `packages/db/migrations/0036_first_vin_gonzales.sql`
- `packages/db/migrations/meta/0036_snapshot.json`
- `packages/db/migrations/meta/_journal.json`
- `packages/db/src/schema/command-center.ts`
- `packages/db/src/schema/index.ts`
- `packages/shared/src/command-center-actions.ts`
- `packages/shared/src/command-center-summary.ts`
- `packages/shared/src/command-center.test.ts`
- `packages/shared/src/command-center.ts`
- `packages/shared/src/index.ts`
- `packages/shared/src/insight-cash.ts`
- `packages/shared/src/insight-engine.ts`
