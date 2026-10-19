# Trading QA — October 19, 2026

Tested on localhost:1421 using a new, separate SQLite database and fictional records only. The normal encrypted database on localhost:1420 was not used for these tests.

## Browser checks passed

- Create one trading account.
- Duplicate account setup into three new accounts in one submission; balances and transaction history are not copied.
- Edit an individual account name.
- Record profit, loss and fees for four selected accounts; apply shared values then independently change one account.
- Record a single-account losing day with zero profit.
- Correct a saved daily result, retaining its reason and previous values.
- Delete a disposable daily result; remove it from totals and preserve its audit snapshot.
- Create a copy group containing all four accounts.
- Record a copied daily summary and correct one account's result.
- Update saved rules across all four accounts.
- Record a single payout request without creating income.
- Reject a duplicate batch payout atomically; preserve inputs for correction.
- Record four payouts as a batch with independently adjusted amounts.
- Confirm a deposit, correct its received amount, then cancel it; linked income follows the authoritative payout without duplication.
- Permanently delete an empty disposable account.
- Reject permanent deletion of an account with linked history; hide and restore it without changing historical totals.
- Restart the QA API and refresh the browser; verify session and records persist.
- Check desktop and mobile form layout; history uses horizontal scrolling on narrow screens.

## Manual arithmetic checks

Four daily results: three at 350 profit − 100 loss − 2.50 fees, one at 350 − 400 − 2.50, total 690. Correcting one loss from 400 to 200 increases total to 890. Deleting a 247.50 result leaves 642.50. Recording a −51 day leaves 591.50. A four-account copied summary of 99 each raises total to 987.50. Correcting one copied result from 99 to −26 leaves 862.50.

A requested payout creates no income. Confirmed 90 receipt creates one deposit; correcting to 85 changes that same deposit; cancellation excludes it from confirmed income.

## Automated coverage

327 tests in 89 files passed. Includes protected Owner/household permissions, idempotent batches, stale revisions, result deletion and retired submissions, legacy migration preservation with unknown profit/loss breakdown, plaintext/encrypted restart persistence, payout corrections/cancellations, income linking, copy-event snapshots, goals and financial calculations. Lint, typecheck and production builds passed.

## Scope

Separate profit/loss fields apply to manual daily summaries. Existing copied events retain signed gross P&L and their existing event correction workflow. Legacy breakdowns are not inferred. There is no bulk-delete action; account and daily-result removal are reviewed individually. Nothing sends trades or withdrawal instructions to Topstep.
