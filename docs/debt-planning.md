# Debt planning — Phase 10

Debt Planning provides payoff scenarios, settlement offers and historical scenario snapshots. It never edits live balances or creates payments from a projection.

## Calculation contract

The engine reuses authoritative duplicate-debt grouping and representative balances. Archived debts are excluded. Missing balances, APRs and minimums produce incomplete projections; explicit scenario assumptions never change the ledger. Zero APR must be entered explicitly.

Monthly interest uses BigInt arithmetic, four decimal places of APR and half-up rounding to cents. Interest accrues before minimums, then extras are applied in snowball, avalanche or custom order. Payments are modelled on the first of the following month. These strategies retain a constant monthly pool and roll freed minimums forward; minimums-only does not. No daily interest, future fees, purchases or contract changes are assumed. The horizon is 1,200 months. Non-amortizing plans have no payoff date. Protect essentials/legal obligations before extras; mathematical order does not determine legal or credit outcomes.

Scenario snapshots retain inputs and captured debts. Future corrections do not rewrite historical projections. Owner/Admin/Editor may save projections; Viewers can preview. Saving a projection does not change another member's obligations.

## Settlements

Offers record creditor, balance at offer, total obligation, dates, status, written agreement, notes and optional document metadata. Savings, discount, initial/monthly requirements and completion date derive from terms. Documents are metadata only.

Each installment has a UUID, date, cents and an optional existing debt-payment link. Schedule amounts must equal the offer obligation. Composite household/debt foreign keys and payment uniqueness prevent cross-debt links and duplicate counting. Completed, nonfuture debt payments alone count as paid. Corrections/cancellations recalculate on read. Overpayments are explicit and do not silently cover a different installment. Actual principal allocations and creditor balance history remain unchanged.

Acceptance does not settle a debt. Completion requires scheduled obligations covered by recorded completed payments plus separate debt reconciliation showing settled status, a confirmed zero balance and verification timestamp. A later cancellation shows the reopened obligation. Tax/credit implications require independent verification.

Offer management reuses protected-debt modification permissions: Owner-exclusive and Owner-linked joint offers cannot be managed directly by non-owners. Regular responsible Admin/Editor members can manage eligible debts; Viewers are read-only. Existing approved account-change workflows remain intact. Offer updates, installments and audit are atomic; stale revisions and duplicate submissions are rejected.

## Storage

Additive migration `0026_chubby_veda` creates offers, installments, payoff scenarios and audit tables. Startup uses the existing verified pre-migration backup gate. No encryption configuration or historical record is rewritten. UUIDs, integer cents, ISO UTC timestamps and repository separation support future PostgreSQL migration. Validated offer terms and immutable snapshots use text JSON (future JSONB); payment relationships are normalized. Existing whole-database backup/recovery includes the new tables.

## QA

436 tests across 117 files passed, plus lint, typecheck and production build. Tests include rounding, missing values, strategies, custom priorities, assumptions, duplicates, overpayments, cancellation, idempotency, stale edits, roles/isolation, rollback, restart persistence and plaintext/encrypted migration preservation, backup, FK and integrity checks.

Isolated browser QA: a fictional $1,000 debt at 12% APR/$100 minimum projected 11 months/$58.98 interest. Adding $100 extra projected 6 months/$31.12 interest and saved a snapshot. A separate $500 offer remained unpaid and created no transaction. Checked mobile 390px and tablet layouts. No real records were used or committed.

Manual follow-up: create installments, record and link payments through Debt details, cancel a payment, review outstanding amounts, verify creditor reconciliation before completion, and confirm an Admin cannot manage Owner-linked offers.
