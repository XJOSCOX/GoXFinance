# Phase 19 — Financial integrity, security and reliability

## Scope and safety

Reviewed current `main` after `git pull --ff-only origin main` reported no incoming changes. The repository is `https://github.com/XJOSCOX/GoXFinance`. This hardening phase follows the [full application audit](full-application-audit-2026-10-21.md); that earlier report describes additional export rendering and browser CRUD evidence.

Reviewed forecast, payroll, opening cash and planner calculations through shared types, API source composition, authorization, persistence and React presentation. Also inspected authentication/CSRF/cookies, banking Sandbox configuration and token boundaries, encryption/recovery, migrations, tracked files and existing cross-module accounting tests. The complete regression suite covers all existing modules, not just the files changed here.

Identified the configured encrypted live database path through the backend configuration without printing or transmitting its passphrase. No live database connection, migration, conversion, restore, seed, reset or financial write was performed for QA. All test data used disposable temporary databases or `data/phase19-fictional-ui.sqlite`; browser acceptance used a separate localhost:1422 server and cookie. The normal application and original localhost:1421 QA database were not used as test fixtures. No real statement, bank account, payment or trade was transmitted.

## Findings and classification

| Classification                        | Evidence                                                                                                                                                                                                                                        | Resolution                                                                                                                                                                                                                                                                                                     |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Confirmed defect                      | Forecast completeness used `warnings.length`, making any explanation invalidate every projected balance. Smart report enrichment classified all warning strings as missing information.                                                         | Added explicit informational, caution and blocking notices. Only blocking uncertainty or missing required cash/amounts invalidates authoritative balances. Known subtotals stay separate. New UI shows the distinction.                                                                                        |
| Confirmed defect                      | A custom forecast with null opening cash could have `incomplete: false`, although ending cash was unknown.                                                                                                                                      | Missing opening cash now produces a blocking explanation and consistent incomplete state.                                                                                                                                                                                                                      |
| Confirmed defect                      | Paycheck fallback suppression remembered only one original/effective payday. Changed dates could leave a recurring assumption beside its recorded paycheck.                                                                                     | Remember source-specific recorded, expected, statement and deposit dates. Suppress exact fallback representations. Flag nearby weekly/biweekly date-only ambiguity and exclude the overlapping assumption; do not manufacture a second receipt. Both smart and custom forecasting use the shared overlap rule. |
| Confirmed defect                      | Distinct confirmed Income deposits sharing a payroll period could be hidden by canonical-period suppression, understating the authoritative ledger subtotal.                                                                                    | Preserve all distinct confirmed ledger deposits, flag the identity conflict and withhold authoritative projected cash until reviewed. Pending/forecast representations still yield to actual Income. No historical record is edited.                                                                           |
| Confirmed defect                      | Planner clamped opening cash before applying subsequent actual movement, then lost any new deficit. Conditional future funds could be recommended without covering that deficit or an unfunded essential reserve.                               | Reconcile signed actual cash first, preserve deficits, and hold unmet deficits/reserves from conditional funding before allocating additional obligations.                                                                                                                                                     |
| Confirmed defect                      | A discretionary priority override could sort ahead of a verified court order or disconnection consequence.                                                                                                                                      | Evaluate verified court orders, then verified consequences, before discretionary priority/deadline ordering. Explicit insufficient-funding and partial-payment explanations remain.                                                                                                                            |
| Confirmed defect                      | A verified accepted settlement could still require a superseded unknown minimum/due date, leaving a fully specified covered projection incomplete.                                                                                              | Use the verified schedule only within its date coverage; preserve unresolved liability outside coverage and gaps; never assume principal forgiveness.                                                                                                                                                          |
| Reliability improvement               | The corrupt-backup rejection test timed out at 5 seconds during concurrent full-strength encryption work; its assertions passed separately. Neighboring restore scenarios already use 20 seconds.                                               | Applied the same targeted 20-second allowance to that test. Corruption, original-file preservation and queued-request assertions remain intact; cryptographic parameters are unchanged.                                                                                                                        |
| Reliability/documentation improvement | Recovery instructions said all snapshots were plaintext and recommended `npm run dev` for every restart, contradicting encrypted operation. Encryption status text also described a historical pre-cutover installation as universally current. | Reconciled recovery, architecture and encryption documentation with configured modes and the encrypted Windows launcher. Normal updates never convert a database or change keys.                                                                                                                               |

## Regression evidence

New shared regressions cover:

- Informational/caution notes with a calculable ending balance and no false missing-data risk.
- Unknown bill amounts, exact known subtotals, missing opening cash and legacy snapshot warning compatibility.
- Early, delayed and corrected paydays; overlapping recurring assumptions in smart and custom forecasts.
- Multiple confirmed deposits sharing a work period, with and without a payroll link.
- Two employers on the same payday and multiple historical work periods without mixing employer identities.
- Actual spending after an older opening balance creating a deficit; conditional funding protecting that deficit and essential reserves.
- Court orders, verified utility disconnection, competing collections, insufficient cash and provider-unconfirmed partial payments.
- Accepted split rent, advance fees, two employer paychecks, a two-day payroll delay and replacement by an actual Income deposit. Inputs and historical forecasts remain unchanged.
- Verified settlement schedules with unknown original minimums/due dates; the projection remains incomplete beyond covered dates or across gaps between replacement ranges.

New authenticated API integration runs in **both plaintext and encrypted** temporary databases. It creates two employer sources and two pending paycheck records, confirms dated opening cash, saves an idempotent immutable projection, then confirms an early actual deposit. Independently asserted cents:

| Stage                                 | Confirmed Income | Conditional Income | Projected ending cash |
| ------------------------------------- | ---------------: | -----------------: | --------------------: |
| Initial: opening $900                 |            $0.00 |          $1,400.00 |             $2,300.00 |
| Civilian receipt corrected to $823.41 |          $823.41 |            $600.00 |             $2,323.41 |

Overview confirmed Income and net recorded cash flow are exactly $823.41. The original saved projection stays byte-for-byte equal through the change and an API restart. Stale submissions, Viewer writes and outsider reads fail safely. SQLite integrity is `ok`, foreign-key violations are zero, and the ledger retains exactly one confirmed and one pending paycheck.

New component regressions verify nonblocking notes remain collapsed and correctly labeled, while unresolved legacy snapshot explanations open automatically.

Existing integration suites cover the larger synthetic-household lifecycle: split rent, utility bills, debts and settlements, cash advances, payroll deductions, opening bank observations, pending holds, conditional payroll delays, budget reserves, Owner proposals, stale approval rollback, immutable plans, source accounting and reports. They also verify all modules in plaintext, encrypted and converted disposable database modes. Each test has isolated keys and file paths; the live configuration is not its database source.

## Financial and authorization review

- Money remains integer cents; safe sums and decimal parsing reject unsafe or ambiguous monetary input. No dependency or alternate accounting ledger was introduced.
- Gross pay, take-home, actual Income and estimates remain separate. Latest YTD is selected per employer rather than summed across statements. Forecast learning remains source-specific.
- Credit-card purchases count toward spending; repayments move cash without repeating purchases. Linked bill/debt payments, refunds and payout Income reuse authoritative records.
- Combine/funded P&L is not deposited cash. Only confirmed payout Income reaches cash-flow totals. Simulations, budgets, goals and planner allocations do not create real transactions.
- Opening cash remains explicitly user-reported with effective dates/times. Same-day ambiguity, pending-hold inclusion, cancelled holds, incompatible account timestamps, duplicate account identities, credit limits and account restrictions retain conservative validation.
- Proposed installment terms never replace actual obligations. Accepted verified terms replace only covered schedules; cancelled/defaulted terms, changed credits and unlinked payments restore/review original coverage. Linked actual payments are deducted once.
- Loan advances remain borrowed cash with authoritative debt ownership. Payroll-deducted repayments are not repeated as bank debits; unknown deduction treatment stays unresolved. No automatic borrowing recommendation was added.
- Argon2id passwords, hashed random session tokens, expiry, logout, HttpOnly/SameSite cookies, same-origin custom-header write checks and authentication rate limiting remain intact.
- Feature services re-read household roles and financial permissions on requests. Owner protection, cross-household isolation, pending proposals, current permission checks and stale fingerprints are exercised by the full regression suite. No newly introduced API route or privilege expansion is part of this phase.

## Database, banking and privacy

No schema change is required. Added report fields are optional for old snapshots, and legacy warning strings remain supported. Saved projections are never rewritten or automatically recalculated. Migration preservation and backup tests run against prior schema versions in disposable databases.

Encrypted mode still rejects wrong keys, plaintext files and corruption without fallback. Recovery tests verify encrypted pre-migration copies, original retention, queued restore and interrupted rename phases. Plaintext development backups are explicitly documented as plaintext. No live key rotation, passphrase change or restore occurred.

Plaid Production remains disabled. Inspection and fictional SDK/gateway tests cover Owner connection management, DPAPI-protected keys, encrypted tokens, sync pagination/revisions, duplicates and reconciliation. No hosted Link session, paid product operation or real-bank connection was attempted.

Tracked-file scan found no private database/backup/paystub/export/key file and no high-confidence private-key/AWS/Slack/Plaid-production token pattern in the scanned tracked source. `.env`, data and backups remain ignored. This limited pattern scan is not a guarantee that every conceivable secret can be detected. Local evidence and generated fictional exports are excluded from commits.

## Executed validation

Final regression: **850 tests across 209 files passed** (21 new tests across three regression files). Lint, standalone TypeScript checks and the production build passed. `npm audit --json` reported zero known vulnerabilities across production and development dependencies. The final run completed in 221.32 seconds; no source edits were made during that run. The commit SHA is recorded in the completion message. Normal encrypted operation was restarted through the existing launcher after confirming there was no queued restore and no migration change; website/API readiness passed and the configured environment passphrase unlocked locally. This was a routine runtime restart, not a QA connection to the live database. Commands executed from the repository root:

```text
npm --script-shell=cmd.exe run lint
npm --script-shell=cmd.exe run typecheck
npm --script-shell=cmd.exe test -- --maxWorkers=2 --reporter=verbose
npm --script-shell=cmd.exe run build
npm --script-shell=cmd.exe audit --json
```

Native encrypted recovery and launcher tests require Windows filesystem/process access outside the command sandbox. A preliminary full run passed 842 tests and hit the single five-second recovery timeout described above. The focused recovery rerun passed all five assertions/tests after its targeted timing correction. No assertion was removed or weakened.

Browser checks used a newly created fictional household. Verified the 30-day and 90-day forecast displays, informational/caution disclosure, $1,800 projected ending cash from $1,000 opening plus $800 conditional Income, missing-opening explanations, and immutable saved forecast presentation. Revisited all 16 workspace routes at 390×844 **after loading states cleared**: no horizontal document overflow or rendered alert errors. Browser console error log was empty. Default viewport was restored. Empty states are included in this fixture; it does not claim every populated form permutation was manually exercised on a phone.

Current dependency audit reported zero known vulnerabilities. Production build retains the existing large-bundle advisory and third-party annotation advisory; these are nonblocking maintainability issues. All tests use local fictional data and providers.

## Remaining risks and user review checklist

- The planner is a deterministic heuristic, not a globally optimal solver. Conflicting critical deadlines can still have no safely funded solution; every unfunded obligation remains visible. A partial reserve does not establish creditor acceptance.
- Date-only overlap is uncertainty, not proof of paycheck identity. Review flagged work periods rather than silently accepting or deleting an Income record. Monthly/semimonthly schedules require explicit dates where not supported; missing required information still blocks authority.
- Opening balances are user reports, not live verified banking. Intraday order, unreported activity and provider posting timing remain outside the available evidence. Multiple accounts require compatible dated observations and verified payment-account attribution.
- Saved historical results preserve the model used when saved. Reading an old snapshot does not retrofit its financial assumptions or warning classification.
- No hosted Plaid Sandbox/Production bank-link acceptance, paid API operation, penetration-test certification, physical-device/screen-reader certification or hardware power-loss certification was performed. Encryption does not protect an already compromised/unlocked Windows account or plaintext exports/`.env`.
- Reports are reopened by automated readers. The earlier audit also rendered PDF pages; Phase 19 did not repeat an interactive Microsoft Excel review or every export layout permutation.

Manual review, without changing historical records:

1. Confirm a known opening cash amount and its actual effective time; review same-day/pending activity before relying on cash availability.
2. Inspect forecast notes: explanations should not hide a numeric projection; unresolved required data should show unknown reliable cash and labeled known subtotals.
3. Review any flagged paycheck identity/work period and check that civilian/military employers remain distinct.
4. Compare critical deadlines, protected reserves and funding gaps; verify partial-payment and settlement terms with their providers.
5. Open an older saved plan and confirm it remains unchanged; compare a newly calculated scenario separately.
6. Retain a secured passphrase recovery record and verified encrypted backup. A live restore, conversion or key rotation requires a separate explicit authorization.

Stop after this hardening phase for user review; no new feature phase is authorized here.

## Changed files

- Shared forecast/planner logic: `forecast-warnings.ts`, `forecast-paycheck-overlap.ts`, `forecast-calculations.ts`, `forecast-inflows.ts`, `forecast-obligations.ts`, `smart-forecast-inflows.ts`, `smart-forecast-events.ts`, `smart-forecast-report.ts`, `planner-cash-flow.ts`, `planner-engine.ts`, `planner-priorities.ts`, `debt-payment-plans.ts`, `forecasts.ts`, `planner.ts`, and the shared `index.ts`.
- Web presentation: `ForecastNotes.tsx`, `ForecastResults.tsx`, `SmartForecastDashboard.tsx`, and `SmartPlannerPage.tsx`.
- Regression coverage: shared `phase19-integrity.test.ts`, API testing `phase19-integrity.test.ts`, `ForecastNotes.test.tsx`, and the targeted timeout in `encrypted-recovery.test.ts`.
- Documentation: this audit, `architecture.md`, `database-encryption.md`, and `recovery.md`.

No dependency, migration, environment, key, financial document or database file is included.
