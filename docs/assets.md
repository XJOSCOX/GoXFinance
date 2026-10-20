# Assets and net worth — Phase 12

Assets & Net Worth stores manual vehicles, real estate, cash/checking/savings, brokerage/retirement, business interests and other assets. Owner/member assignments and existing debt links are normalized. Purchase price never supplies an assumed market value. Unknown values remain null. Cash/checking overdrafts may be negative; other valuations must be nonnegative.

Valuations append dated, sourced, confidence-labelled records. A correction explicitly supersedes an earlier valuation; its original row and audit remain. Asset profile changes and archive/restore use revisions, submission keys and atomic audit writes. Owner-linked assets require Owner management; regular responsible Admin/Editor members may manage eligible records but cannot change ownership assignments. Viewer writes and cross-household member/debt/valuation links are rejected. Debt links reuse protected-debt authorization.

The shared `netWorth` calculator reads the existing Debt ledger and balance history. Verified original/collection duplicates and shared records count once. Assets may link several loans; each loan counts once in household liabilities. Individual views show the full associated joint record, not an invented ownership percentage, and must not be added to household totals. Equity may be negative; association equities must not be summed across assets sharing a loan.

Known net-worth subtotal = known asset values − known liabilities. Missing amounts produce explicit incomplete warnings. All values are recorded/estimated, never live market quotes. Topstep nominal account sizes, Combine/XFA balances and unrealized profits are not imported. Confirmed payout Income does not automatically change a manually entered cash asset.

## History and limitations

As-of views choose dated valuations and debt balances, never future values or purchase prices. Historical ownership/archive/duplicate-link state cannot be reliably reconstructed from legacy debt metadata; such backdated views are explicitly marked incomplete and use current associations. **Captured net-worth snapshots** preserve the actual source records, scope and totals at capture time, independent of future corrections. They are the trustworthy recorded net-worth history. Capturing requires Owner for household scope or the authorized member for individual scope, with stale-source checks and idempotency.

Additive migration `0028_round_bedlam` adds assets, member/debt associations, valuations, audit and immutable net-worth snapshots. Existing startup verifies a safety backup. UUIDs, cents, ISO UTC timestamps, JSON snapshot contracts and repository boundaries support a later PostgreSQL dialect/migration. No live database conversion or cloud connection is introduced.

## Verification

461 tests across 125 files passed; lint, typecheck and production build passed. Additional asset validation/rollback checks passed after the final negative-value guard. Coverage includes missing and historical values, negative equity, duplicate debts, joint ownership, role protection, stale writes, corrections, persistence, rollback, foreign keys/integrity, and preservation/verified backups in plaintext and encrypted mode.

Isolated browser QA created a fictional $10,000 vehicle against $1,000 existing fictional debt: $9,000 known subtotal. A corrected $9,500 valuation produced $8,500 while retaining the earlier captured $9,000 net-worth snapshot. Mobile 390px/tablet checked. No real records were modified or committed.
