# Debt and bill payment options

## Recording a payment

Use **Record payment** on a debt or bill row, or in its payment history. The form records information locally; it does not connect to a bank or process a payment.

- Debt presets: monthly minimum, recorded outstanding balance, past-due amount, or custom/partial.
- Bill presets: actual full billed amount, remaining unpaid amount after completed payments and credits, or custom/partial. Budget estimates are never payment presets.
- Unknown amounts display Unknown and disable their preset. Known zero amounts display $0 and are disabled as nothing due. Custom amounts remain available.
- Selecting a preset fills only the amount. Review and change it before saving. Principal, interest, fees, and reference number remain separate optional information.
- New payments default to Pending. Scheduled, Pending, Failed, and Cancelled records do not contribute to completed payment totals. Completed requires explicitly confirming that the payment cleared in the form. Existing scheduled/pending records use the Confirm action; cancelled records remain in history.
- A completed record cannot be silently changed to another status through Edit. Use the audited cancellation action. A failed record may be corrected to pending/scheduled before confirmation.

Full Balance uses the recorded account balance, which is not a creditor payoff quote. The form warns about interest, fees, and timing. No preset fills principal or marks a debt Paid/closed/settled. Only known principal affects an estimated balance; creditor-verified balances and history remain intact. Final payoff verification stays in the separate Balance History/reconciliation workflow.

## Permissions and linked records

Owner-exclusive records remain protected. Authorized Admins/Editors can save unconfirmed payments for Owner-linked joint obligations, then request Owner confirmation. They cannot bypass approval by submitting Completed directly. The API enforces this on debt and bill creation as well as existing payment actions.

A completed debt-linked bill creates one authoritative debt payment with its supplied allocation and reference information, inside the same SQLite transaction as the bill record and audit. Later confirmation of an unconfirmed bill follows the same rule. Corrections update that same debt payment, and cancellations are reflected in bill history. Reading a linked bill also reflects corrections performed through the debt manager. Existing clients that omit the newly optional breakdown fields do not erase previously known allocations.

## Implementation and migration

- `packages/shared/src/payment-presets.ts`: pure preset definitions/calculations.
- `apps/web/src/components/payments`: reusable amount cards, breakdown fields, and clearance review.
- Debt and bill forms own their feature-specific API mapping and state. Exact decimal parsing and formatting are shared in `apps/web/src/lib/payment-money.ts`; inputs with more than two decimal places are rejected rather than rounded.
- Migration `0013` adds nullable bill allocation/reference fields and widens the bill-payment status constraint. SQLite requires copying the payment table to widen its CHECK. The migration retains every existing column value, UUID, idempotency key, date, status, confirmation timestamp, and debt/period link, with foreign-key enforcement left enabled. It does not alter prior migrations or financial balances. Existing automatic pre-migration snapshots remain active.

## Verification

Tests cover presets (including unknown/zero amounts), custom edits, exact cents, clearance confirmation, all payment statuses, duplicate submissions, known-principal preservation, no automatic payoff, Owner restrictions, linked correction/cancellation, populated migration preservation, and API restart persistence.

Browser QA used only the isolated fictional localhost:1421 database. Verified bill/debt row shortcuts, the remaining-bill preset and cleared confirmation, a scheduled full-balance debt record with unchanged completed totals, disabled unknown presets, and the payoff warning. The shortcut dialogs mount after their detail dialog so focus and stacking stay correct. QA databases and screenshots remain outside Git.
