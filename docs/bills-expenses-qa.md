# Bills, Expenses, and Overview browser verification

Verified October 19, 2026 (America/Chicago) against the isolated localhost:1421 QA server using fictional records only. The normal development database was not used for these operations.

## Confirmed through the browser

- Signed in with the fictional Owner account; authenticated Overview loaded.
- Created a variable recurring bill with a $300 budget estimate. Generated periods kept their actual amounts unknown.
- Entered a $342.18 actual amount. The period remained unpaid.
- Opened the payment dialog; the payment amount was empty rather than copied from the estimate.
- Recorded $200 as pending. Confirmed paid remained $0 until explicit confirmation.
- Confirmed that payment. The period displayed partially paid, $200 paid, and $142.18 remaining.
- Created a fictional $25 credit-card expense, split into $20 Groceries and $5 Household Supplies. Category/member summaries matched; non-credit cash paid remained $0 on Expenses.
- Refreshed the browser and verified the saved expense and authenticated session remained available.
- Overview displayed $225 purchase spending ($200 standalone bill payment plus $25 purchase), $200 cash paid, the $300 expected monthly obligation, and $142.18 actual remaining.
- Inspected tablet/default, 1440×900 desktop, and 390×844 mobile layouts. Mobile bill and expense forms scroll internally and retain visible action footers. Measured mobile form width 348px within the 390px viewport, with no horizontal page overflow. Desktop Overview also had no horizontal page overflow.

## Fix from visual review

Native date-picker icons had low contrast on the dark input background. The reusable Input component now uses Tailwind's dark color-scheme utility. Verified its computed color scheme and visible calendar icon in the mobile form. No feature-specific stylesheet was added.

Screenshots remain outside the repository. Automated verification remains in the colocated tests; this browser pass supplements the 115 passing tests and does not replace the permission, migration, rollback, and persistence tests.
