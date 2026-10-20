# Banking manual QA handoff

Use a separate fictional household/database (the existing QA site is `http://localhost:1421`). Do not import a real statement or connect a real institution for this checklist. Automated tests cover these services and both database modes; this checklist is the final user acceptance gate.

- Create a manual checking account and enter a dated balance observation. Confirm it remains separate from income and net worth.
- Import a small fictional CSV using explicit date/debit/credit mapping. Check preview amounts and duplicate warnings, then repeat the import and verify no duplicate rows.
- Review an expense with two category allocations. Verify allocations equal the total and the Overview changes only after confirmation.
- Link an existing paycheck or completed payment; verify it is not recorded twice. Pending bank authorizations must not complete payments.
- For a debt-linked bill, select an already recorded debt payment. Confirm one debt payment, one bill reference and one cash outflow. Leave principal unknown when no allocation was recorded.
- Confirm a variable bill's actual amount while retaining its estimate; record a partial payment and verify the remainder.
- Import matching transfer legs; pair them and verify no purchase spending or income. An unpaired transfer stays visibly unmatched.
- Record a refund against an original purchase and categories. Verify net spending/paid amounts change, originals remain intact, and an over-refund fails without partial writes.
- As an explicitly assigned Admin/Editor, submit a reconciliation; approve/reject as Owner. Change the target after a request and verify stale approval is rejected. A Viewer or another household must not write or see unassigned bank accounts.
- Check Bank accounts, Transactions and the expandable Overview bank section on desktop and a narrow mobile screen.
- Preview Banking reports and open JSON, CSV, Excel and PDF exports. They must contain financial summaries, not provider IDs, cursors, credentials or tokens.
- Create/verify a backup, restart the isolated API and verify account/inbox/reconciliation history. Test restore only against disposable QA data; restore invalidates sessions.

## Optional developer Sandbox acceptance

This requires your own **Sandbox** credentials in the ignored backend `.env`; do not paste them into chat. Automated SDK contract/mock tests do not replace this provider-hosted check.

1. Follow [banking.md](banking.md) to configure Sandbox and protected Windows token storage; restart.
2. Open **Bank accounts → Connect Sandbox bank** and authorize only fictional Sandbox credentials in Plaid Link.
3. Preview/confirm Sync Now. Verify cached balance observations, inbox counts and no automatic accounting.
4. Sync again; exercise provider-supported pending/posted and update-mode fixtures. Confirm cursor/idempotency, reauthorization and safe errors.
5. Disable/disconnect and verify prior accounting remains, token ciphertext is removed on disconnect, and the conservative lifetime slot is not replenished.

## Before any real bank activation

Production connections are disabled in code. Independently verify free Trial eligibility, Transactions entitlement, lifetime Item usage/cap and expiry in Plaid Dashboard, confirm no paid plan/products, and give separate explicit authorization. A reviewed production entitlement gate and production configuration must then be implemented before connecting. If a $0 entitlement is unavailable, use manual imports. No real bank test is authorized by this checklist.
