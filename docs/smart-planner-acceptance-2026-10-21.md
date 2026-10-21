# Smart Planner fictional acceptance results

Tested October 21, 2026 against the isolated website at `localhost:1421` and API at `127.0.0.1:3002`. All records were fictional. The normal API and encrypted financial database were not opened, restarted or modified for this acceptance run.

## Checklist: 10/10 in the fictional environment

| Check                                                    | Result                                                                                                                                                                                                                   |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Dated available bank balance and pending-debit treatment | Saved a $900 fictional checking observation in America/Chicago, explicitly selected “No — apply future debits separately”, then selected that observation as opening cash.                                               |
| Safety and essential living reserves                     | $300 safety buffer plus $100 essential living reserve; $400 protected and $500 available for allocation.                                                                                                                 |
| Essential obligation priorities                          | Housing suggested critical and electricity essential. Suggestions were distinguished from verified legal consequences.                                                                                                   |
| Split rent without duplication                           | Proposed $550/$450 installments left the original $1,000 due. Accepted, verified replacement terms produced exactly two installments totaling $1,000.                                                                    |
| Advance repayment and fees                               | A dedicated fictional $120 debt linked a $100 received advance and $20 fee. Exactly one $120 repayment appeared on October 23. The receipt preceded opening cash and was not added again or classified as earned income. |
| Conditional next paycheck                                | The documented $900 paycheck remained expected, with funding labelled “Awaiting documented deposit”; available cash stayed $900.                                                                                         |
| Two-day paycheck delay                                   | Preview moved October 23 payroll to October 25 while leaving actual payroll and repayment dates unchanged. October 23–24 projected cash was negative $70.                                                                |
| Allocation and gaps                                      | Baseline deadline gap: $350 ($50 first rent installment plus $300 utility). Delayed-paycheck gap: $470, adding the $120 repayment. Later rent reserved $450 from conditional payroll arriving before its deadline.       |
| Save, refresh and restart                                | Saved the delayed-paycheck scenario, restarted only the QA API, reloaded the browser and retrieved the immutable report. Its $470 gap, $20 fee and two-day adjustment were preserved.                                    |
| No automatic financial transactions                      | Read-only QA database checks found zero new bill payments, debt payments, expenses or Income transactions during acceptance. Integrity check returned `ok`; foreign-key check returned no violations.                    |

The checklist's real-bank-balance step was exercised with a fictional observation as requested. This does not attest to the accuracy of any real bank balance.

## Owner permissions

The running QA API was tested with fictional Owner, Admin, Editor, Viewer and outsider identities. Role assignments were seeded as isolated test fixtures; sensitive proposals and decisions used authenticated APIs.

- Editor joint-obligation proposals remained pending with no active record until Owner approval.
- Self-approval returned 403. Duplicate approval retries returned the original record; a new second approval returned 409.
- Admin proposals could be rejected; Editor proposals could be cancelled without changing the approved record.
- Changed underlying debt data made approval stale (409).
- Owner-exclusive writes were denied to non-owners; Viewer writes and cross-household access were rejected.
- The browser's existing QA Owner approved an Editor's fictional joint-rent priority proposal, then rejected a correction. The approved critical priority remained at revision 1.

## Issue found and fixed

The record's Audit history displayed successful approval but omitted related proposal submissions, rejected corrections and cancellations, although those audit rows were persisted. The lookup now follows requests targeting the record and the persisted result of its original creation approval. Existing actor visibility restrictions remain enforced. SQLite audit rows are ordered by timestamp and insertion order so events within the same millisecond retain their sequence.

Regression assertions cover the complete Owner history and the requester's restricted history for both Admin and Editor roles. The corrected browser history was verified after the QA restart.

## Checks and boundaries

- Full regression run before the audit display correction: 796 tests across 198 files passed.
- After the correction: all 11 planner API tests passed, including plaintext/encrypted persistence and role checks.
- Lint, typecheck and production build passed after the correction. Existing bundle-size advisory remains.
- Desktop and mobile views were checked; at mobile width the document content matched the viewport with no horizontal overflow.
- Existing incomplete-source warnings remained visible. A deliberately unfunded scenario is an expected planning result, not a failed test.
- No payments were transmitted, advances requested, bank connections created or real financial data used. QA scripts, credentials, database files, logs and screenshots remain outside version control.
