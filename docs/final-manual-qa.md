# Final full-application manual QA

Perform write tests in a disposable QA database with fictional records. Keep the real encrypted database and recovery copies unchanged. Clear only disposable QA data. Restart the normal launcher after updating source so its API applies additive migrations through the verified pre-migration backup gate. Do not share the unlock passphrase.

## Authentication and households

- [ ] Sign up, sign in, refresh, sign out, and sign back in; restart the API and confirm session behavior.
- [ ] Create a household; invite a member and redeem the code in a second fictional account.
- [ ] Test Admin, Editor, and Viewer permissions and cross-household isolation using both the UI and unauthorized API requests.
- [ ] Verify no member can edit, unlink, deactivate, remove, or change the protected Owner's role.
- [ ] Submit member proposals; approve and reject them as Owner. Verify duplicate approval creates one member and invitations require approval.

## Debts, bills, expenses, income

- [ ] Create, edit, archive and restore a debt. Verify unknown balances/APR/minimums remain unknown.
- [ ] Record minimum/full/custom payments with known and unknown principal. Verify full selection does not settle/close a debt.
- [ ] Exercise scheduled, pending, completed, failed and cancelled payments, correction history and duplicate submission.
- [ ] Submit sensitive joint Owner-linked changes; approve/reject and reject stale requests after an intervening change.
- [ ] Create fixed/variable recurring and one-time bills; check month-end/leap-day dates and that one-time bills never recur.
- [ ] Keep a $300 variable estimate; confirm a $342.18 bill and pay $200. Verify $142.18 remains, with all three amounts distinct. Test credit/overpayment and cancellation.
- [ ] Record a debt-linked bill payment; verify one authoritative debt payment and one cash outflow after correction/cancellation.
- [ ] Create, edit, split and void an everyday expense; allocations must equal the total. Verify credit purchases are spending and repayments do not become a second purchase.
- [ ] Enter a $25/hour income source with variable hours/overtime. Confirm actual gross, deductions, net and deposit date; correct a historical paycheck without changing rate snapshots.
- [ ] Verify missed paychecks, duplicate confirmations, gross versus net, and confirmed income versus completed outflows on the overview.

## Budgets, trading and goals

- [ ] Draft a monthly budget from saved bills; adjust before saving. Verify allocation, assigned categories, unallocated funds and actual purchase spending separately.
- [ ] Test category filters, archived categories, copying a budget month, and split spending.
- [ ] Create single/batch trading accounts; edit one/all, hide/restore and test permanent removal restrictions around payouts.
- [ ] Record single/copied daily results including profit, loss, fees-included and negative/zero days. Correct/cancel entries and verify one account-level result each.
- [ ] Change copy-group membership and confirm earlier event membership snapshots do not change.
- [ ] Switch calendar account/all views; confirm daily/weekly/monthly totals, Combine P&L exclusion from cash and trailing-floor history.
- [ ] Promote a fictional Combine; verify its distinct XFA starts at the configured fresh balance and Combine history remains separate.
- [ ] Record mixed-status payout batches; only confirmed deposited payouts link one Income transaction each. Corrections/cancellations remain synchronized.
- [ ] Create account/group goals and verify daily averages, weekly remainder, combined/per-account progress, negative days and deadline handling.

## Phases 10–13

- [ ] Compare snowball, avalanche, custom and minimum-only payoff strategies. Increase extra payment and verify dates/interest; missing APR requires an explicit assumption.
- [ ] Save a payoff scenario, then change a fictional debt. Verify the original scenario retains its debt snapshot.
- [ ] Add/correct multiple settlement offers, written confirmation and schedules. Link existing debt payments, verify partial/missed installments, and require verified creditor reconciliation before completion.
- [ ] Forecast 7/14/30/60/90/custom days with explicit starting cash and conservative/expected/optimistic income. Verify missing starting cash is unknown, not inferred.
- [ ] Check linked obligations and scheduled payments count once; optional uncertain payouts stay outside the baseline; compare shortfall dates manually.
- [ ] Save a forecast snapshot, then change a bill. Verify saved assumptions and results remain unchanged.
- [ ] Add an asset, historical valuations and a correction; link a loan and test negative equity. Verify purchase price and nominal trading balances are excluded from asset values.
- [ ] Capture net worth, update a valuation, and verify the old capture remains unchanged. Test member/household views and missing-value warnings.
- [ ] Preview monthly/annual reports with member/category/debt/account/group filters. Compare totals with the overview for identical dates and scope.
- [ ] Download PDF, Excel, CSV and JSON; verify exact cents/unknowns, read-only scope, date labels, estimates and actuals, and that JSON is clearly not a restorable backup. Store sensitive downloads securely.

## Recovery and usability

- [ ] Create and verify a recovery backup; restore only into a disposable database and compare records/integrity.
- [ ] Restart both plaintext and encrypted QA APIs, refresh the browser, and verify records/history persist.
- [ ] Test desktop and mobile: keyboard navigation, focus, form errors, notifications, expanded/collapsed details, and no page-wide horizontal overflow.
- [ ] Confirm git status contains source only: no databases, WAL/SHM files, passphrases, reports, backups, or personal records.

After this checklist, stop feature development and review any failures before entering new real data.
