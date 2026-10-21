# Full application audit — October 21, 2026

## Scope and isolation

Audited the current application through its complete Vitest suite, lint, TypeScript checks, production build, dependency advisories, export readers, and browser acceptance checks. All test writes used temporary databases or a new fictional database served at localhost:1421. The normal localhost:1420 database was not edited, restored, reseeded, or unlocked for inspection. No real bank was connected and no payment, trade, withdrawal, or cash advance was transmitted.

This report distinguishes automated coverage from browser checks. It does not claim that every possible combination of every form was manually clicked.

## Gates

| Gate                                    | Result                                                                                                                                                                                                                                                            |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Full automated regression               | 829 tests across 206 files passed with the Windows access required by native recovery and launcher tests.                                                                                                                                                         |
| Lint                                    | Passed.                                                                                                                                                                                                                                                           |
| TypeScript and production API/web build | Passed. Existing Vite bundle-size advisory remains.                                                                                                                                                                                                               |
| Dependency advisories                   | `npm audit --json`: zero known vulnerabilities across production and development dependencies at audit time.                                                                                                                                                      |
| Browser navigation                      | All 16 workspace destinations opened in the fictional household. No browser console errors were captured.                                                                                                                                                         |
| Mobile layout                           | All 16 destinations checked at 390×844; no horizontal document overflow or rendered alert errors in the exercised states. Scrollable calendar/table containers remain supported.                                                                                  |
| Actual QA process restart               | 85 persisted tables unchanged, excluding authentication sessions and users; SQLite integrity `ok`, zero foreign-key violations. One bill payment, three trading results, and zero income transactions retained.                                                   |
| Export reopening                        | PDF, Excel, CSV, and JSON reopened successfully. Independent pypdf parsed nine PDF pages; all pages rendered for visual review. JSON contained 32 report tables; Python CSV reader read 196 rows. ExcelJS reopened the workbook and checked its sheets and cells. |

## Feature coverage

The full suite includes authenticated API, database, shared calculation, parser, and React component tests. Representative coverage by feature:

| Feature                       | Exercised behavior                                                                                                                                                                                                                                                                                                                                 |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Authentication and households | Signup/login/logout, sessions and distinct QA cookies, protected Owner membership, invitations, role permissions, cross-household isolation, pending proposals and Owner review.                                                                                                                                                                   |
| Debts and payments            | Create/edit/archive/restore, responsibility and duplicate grouping, unknown balances/APRs, principal versus total paid, recorded balance history, payoff progress, future-date rejection, approval staleness, idempotency and rollback.                                                                                                            |
| Bills                         | Fixed/variable and recurring/one-time amounts; monthly estimates, confirmed actuals, partial/overpaid/credited periods; payment correction/cancellation, month-end schedules, arrears and next-month projections; current estimate edits and clearing; historical snapshots.                                                                       |
| Expenses and categories       | Exact cents, category splits, cash versus credit-card purchases, linked debt repayments, voids, refunds, historical classifications, category associations and permissions.                                                                                                                                                                        |
| Income and payroll            | Confirmed/pending/estimated separation, hourly and salary statements, weekly/biweekly/semimonthly/monthly detection, employer matching, separate employer learning, latest YTD per employer rather than summed statements, canonical tax/retirement categories, multi-file review, duplicate uploads, confirmation and authoritative Income links. |
| Payroll predictions           | Hours/minutes conversion, regular/overtime/PTO, recurring earnings and approved deduction rules, employer-specific histories, actual-versus-estimate comparison, draft reconciliation, correction/deletion and audit history. Synthetic civilian paystubs and military LES documents pass the real extraction/parser path.                         |
| Trading accounts              | Single/batch creation, duplication, rule correction, grouping matching accounts, individual/batch editing, hide/restore/removal constraints, payout-protected deletion, household authorization.                                                                                                                                                   |
| Trading activity              | Separate profit/loss/fees, fee-included net results, daily and copied entries, per-account results, negative/zero days, duplicate prevention, corrections and cancellation, historical copy-group membership, exactly-once performance aggregation.                                                                                                |
| Combine and funded separation | Combine simulated results excluded from cash and payout income; trailing floor and lock, explicit passing/promotion with fresh funded starting balance, manual review reminders; funded winning-day counts, editable rule settings and payout estimates. No provider eligibility or live risk enforcement is claimed.                              |
| Payouts                       | Individual and batch requests, different account statuses/amounts, explicit received deposits, income linkage at most once, idempotency, correction/cancellation and restart persistence.                                                                                                                                                          |
| Goals                         | Account/group targets, weekly aggregation and daily averages, future-period state, losses and fees, debt due-date goals, settlement review, recorded-source progress and access controls.                                                                                                                                                          |
| Budgets                       | Monthly allocation, category assignments/unallocated amount, bill-based editable preview, actual spending and remaining amounts, credit/debt-transfer exclusion, linked bill edits, independent month/scope records, copy/archive/restore and persistence.                                                                                         |
| Banking and reconciliation    | Manual account observations, CSV mapping/preview/import, duplicates, pending/posted transitions, purchase classification, existing bill/debt/income matching, transfers/refunds, stale approvals, source corrections, secret-free reports and retained financial history.                                                                          |
| Plaid integration             | SDK contract and fictional gateway tests: Link/exchange, preview/sync, cursor/page atomicity, repeat sync, account/household isolation, Windows-protected token keys, backup/recovery and disconnect history. These tests do not substitute for provider-hosted Link acceptance.                                                                   |
| Debt planning                 | Snowball/avalanche, unknown APRs, settlements, partial debt-payment links without duplicate payments, corrections, exact totals and immutable saved projections.                                                                                                                                                                                   |
| Forecast and Smart Planner    | Explicit opening cash, 30/90-day forecasts, dated balance observations, pending-debit treatment, buffers/reserves, essential priorities, split-rent replacement, cash-advance fees/repayment, delayed conditional payroll, funding gaps, Owner approvals, stale fingerprints, immutable saved scenarios and no automatic accounting writes.        |
| Assets and net worth          | Vehicle assets and linked loans, equity, valuations, incomplete liabilities, immutable historical captures, permissions and restart persistence.                                                                                                                                                                                                   |
| Reports                       | Scope/filter isolation, totals reconciled with overview, secret allowlists, inert spreadsheet text/CSV formula mitigation, exact cents, JSON/CSV/Excel/PDF output, independent reopening and PDF rendering.                                                                                                                                        |
| Encryption and recovery       | Plaintext/encrypted/converted databases, additive migration preservation, pre-migration backups, wrong-key rejection, source retention, interrupted encrypted restores, session invalidation, rollback and backup confidentiality.                                                                                                                 |
| Windows launcher              | Website/API readiness, environment or locally entered unlock configuration, IPC shutdown, runtime leases and encrypted restart. Tests use fictional keys and temporary databases.                                                                                                                                                                  |

## Browser acceptance evidence

The fictional QA site was seeded with three $50K Combines, a copy group, a loan, three bills and a monthly budget. No real financial data was copied into that database.

1. Signed in through the ordinary login form as a fictional Owner using the QA-specific cookie.
2. Opened Household, Bank accounts, Transactions, Income, Bills, Expenses, Smart Planner, Budgets, Debts, Debt planning, Cash flow forecast, Assets & net worth, Goals, Trading, Reports and Overview.
3. In the variable-bill payment form, retained the $300 estimate, confirmed $342.18 actual billed, entered a $200 partial payment, selected Completed and explicitly confirmed clearance. The bill showed $142.18 remaining. Its next-month projection showed $442.18: $300 next month plus $142.18 carried if unpaid.
4. Budget showed $200 actual spending and $1,800 remaining from a $2,000 allocation, with the planned $1,500 category assignment unchanged. Overview showed $0 confirmed income, $200 cash paid and −$200 recorded cash flow.
5. Used Select all accounts and shared profit $500/loss $125/fees $0, then applied and saved a reported-day batch for October 20. The three Combines showed $375 each and $1,125 combined; funded P&L and payout income stayed zero. Journal balance was $50,375 and the completed-session floor $48,375 per account.
6. The daily calendar defaulted to Audit Leader at $375. Selecting All Combine accounts changed its monthly/day/week totals to $1,125, with unrecorded dates remaining distinct from recorded zero results.
7. Checked all 16 routes at phone width and inspected the browser console. No horizontal page overflow or console errors were observed.
8. Restarted the actual isolated QA API process. Independently compared persisted data across 85 tables and reloaded the browser. The bill payment, trading batch and reconciled Overview remained present; integrity and foreign keys passed.
9. Opened the rebuilt payment dialog and verified exact `Payment status` label lookup after the accessibility fix. Cancelled that inspection without recording another payment.

## Finding fixed

**Unstable accessible names on shared form controls.** A wrapping label caused dropdown names to contain all option strings (for example, Payment status plus Scheduled/Pending/Completed/Failed). This made exact label lookup fail and produced verbose accessible names. `FormField` now supplies a stable `aria-labelledby` label to child controls while preserving explicit accessible names. A regression verifies the dropdown keeps its field name after selection; related bill, budget, debt, payroll and trading form tests pass. The rebuilt browser control was independently verified.

## Environment-only failures

The initial command-sandbox run reported 13 failures, including encrypted restore renames and launcher shutdown. Error logs identified Windows `EPERM` restrictions in sandbox temporary directories. A focused recovery run outside that sandbox passed all five tests, and the unrestricted complete run passed. No encryption or recovery safeguards were weakened, and real data was never used to reproduce these failures.

## Reproduction

From the repository root:

```text
npm --script-shell=cmd.exe test -- --maxWorkers=2 --reporter=verbose
npm --script-shell=cmd.exe run lint
npm --script-shell=cmd.exe run build
npm --script-shell=cmd.exe audit --json
```

Native Windows process, backup and restore tests require filesystem/process permissions beyond the command sandbox. Tests isolate their databases automatically. Optional `GOXFINANCE_QA_EXPORT_DIR` retains only fictional acceptance exports for independent reopening.

Logs, fictional databases, credentials, generated exports and screenshots remain outside version control. Source, the regression and this report are the only committed audit changes.

## Remaining acceptance boundaries

- Provider-hosted Plaid Link/Sandbox authorization and any real-bank Production connection were not run. The local app audit uses fictional gateway/SDK tests; no account connection or external financial action is implied.
- The browser pass is representative end-to-end acceptance plus all-route mobile checks. Full CRUD, role combinations, failure paths, parser variants and restore scenarios are exercised by automated tests rather than every permutation in the browser.
- This is not penetration-test certification, physical-device/screen-reader certification, or destructive hardware/power-loss testing. The restore tests simulate interrupted phases in disposable databases.
- PDF/Excel/CSV reopening uses parsers and rendering tools, not an interactive Microsoft Excel session. Ordinary report exports retain their existing sensitive-file disclosures and are not encrypted database backups.
- No financial-data correction or schema migration was necessary during this audit. No remaining defect was found in the exercised local workflows after the form-label fix.
