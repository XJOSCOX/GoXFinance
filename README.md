# GoXFinance

GoXFinance is a local website with authentication, household management, debts and payment history, recurring/one-time bills, everyday expenses, and a household Overview. All records live in SQLite. There is no cloud integration.

## Run locally

Install Node.js 22 or newer. From the repository root:

```powershell
npm install
npm run dev
```

Open **http://localhost:1420**. Vite serves the website and forwards `/api` requests to Fastify at `http://127.0.0.1:3001`. The API creates and migrates `data/goxfinance_web.sqlite` on startup. Migrations are additive; existing accounts, sessions, households, and members stay in place. The `data/` directory and SQLite WAL/SHM files are ignored by Git. The prior Tauri database, if present in the OS app data directory, is not opened, migrated, or deleted.

Copy `.env.example` to `.env` to change the API port, frontend origin, or local data directory. If you change the API port, update the Vite proxy in `apps/web/vite.config.ts` as well. Run `npm run build` for production bundles; the website is emitted to `apps/web/dist` and the API to `apps/api/dist`. Run `npm run start:api` to start the built API. A production web server must serve `apps/web/dist`, forward `/api` to Fastify, and fall back to `index.html` for app routes, including `/household/setup`, `/household/join`, `/households/:householdId/members`, `/households/:householdId/debts`, `/households/:householdId/bills`, and `/households/:householdId/expenses`.

## Households

After signing in, an account without a household is sent to the setup page. Creating a household assigns the creator the protected Owner role and creates their linked member record in one transaction. Repeating setup returns the existing household. The Household sidebar link opens the house and its people in one card. The Owner can directly add, edit, deactivate, remove, and reactivate regular members. The Owner's linked member record and role cannot be changed through membership APIs. Admins and Editors can propose a member; the Owner reviews the request before a member record is created. Viewers can only read. Removing a linked regular member revokes that account's access to this household and retains an inactive member record; the account and its other households remain intact. Reactivating the record does not restore access. Household members need no email or password.

Only the Owner can assign roles and issue invitations. An unregistered member's planned role defaults to Viewer; it grants no access until invitation acceptance. Changing it revokes any pending invitation. The Owner can also change a registered regular member's active role, effective on subsequent requests. The invitation code is displayed only when issued or regenerated; copy it then and share it privately. It expires after seven days, works once, and can be revoked. A new user can choose **Join with code** at signup; an existing user can use **Join household** on the Household page. Redemption links the account to the approved member record without changing its profile. Ownership transfer and household deletion are unavailable. A user with one household sees it by default; users with multiple households can select one in the sidebar. Overview summarizes the selected household’s stored records.

The Household page shows the selected house with its members inside the same card. The Owner sees a **Pending approvals** section with request details and approve/reject actions. **Manage Access** handles roles for regular members. **Details** shows the house creation date, member count, move-in date, and notes. Owners and Admins can use **Edit household** to change its name, optional move-in date, and notes. Existing households start with those optional fields empty; no move-in date is inferred.

## Debts

The **Debts** sidebar page tracks household accounts, balances, status, collection links, and responsible members. One joint debt can have several members without duplicating the household total. Unknown balances remain unknown. Confirmed, estimated, and unverified balances are shown separately. A collection record is combined with its original account only when its duplicate link is explicitly verified. Archive hides an account from active totals without deleting it; Restore reverses that action. Debt records are saved in SQLite, never browser storage.

Debt details include payments and balance history. Record completed, pending, scheduled, or failed payments with optional principal, interest, and fees. Scheduled and pending payments count as completed only after confirmation. Edits and cancellations retain audit records. Record a creditor statement or reconciliation as a new verified balance without deleting earlier balances or payments; editing an existing account cannot overwrite its recorded balance directly. The displayed estimate subtracts only known principal from completed payments dated after the latest verification. If principal is unknown, the estimate remains unknown; it never assumes that the whole payment reduces the debt. Even when calculable, the estimate excludes any unreported interest or fees and is not a creditor statement. This stage does not calculate payoff plans.

On debts shared with the Owner, authorized Admins and Editors use **Request edit**, **Request cancellation**, **Request confirmation**, or **Request balance change**. The Owner reviews the current and proposed values in **Owner approvals** on Debts or the accountâ€™s **Approvals** tab. Approval applies the change atomically; rejection keeps the existing record. A changed record or revoked requester permission blocks approval. Same-day statements/payments leave the estimate unknown until a later balance verification resolves the ambiguity.

Owners can open **Database recovery** on the Household page. Full-database operations are available only when the user owns every household and all accounts belong to those households. Restore requires confirmation and an API restart; it retains a recovery snapshot and invalidates sessions. See [safe recovery instructions](docs/recovery.md) and the [QA audit](docs/qa-audit.md).

## Bills, everyday expenses, and Overview

**Bills** keeps recurring schedules and one-time obligations separate from their actual payments. Variable bills have independent periods, actual billed amounts, estimate snapshots, partial payments, credits, overpayments, and completed-period averages. Payments default to Pending; recording Completed requires explicit cleared confirmation. Sensitive changes on Owner-linked joint bills use Owner approvals; Owner-exclusive records stay protected. Linked debt payments share one authoritative transaction.

**Expenses** records everyday purchases with a responsible member, payment method, searchable merchant/description, date and category filters, optional category splits, corrections, and audited voiding. Monthly summaries show category and member spending. No bank balance is changed.

**Overview** shows known debt balances, monthly expected obligations, actual purchase spending, confirmed cash paid, upcoming/overdue bills, and missing information. Credit-card repayments do not count as a second purchase, and linked bills/debts are counted once. Income, Trading, available-cash projections, and advanced charts are not included.

See [Bills & Expenses guide](docs/bills-expenses.md) for workflows, accounting rules, migration safety, and current limitations. New code uses shared UI components and formatting; run `npm run format -- <files>` to format named files.

## Security and storage

Accounts and sessions are stored in server-side SQLite. Passwords use Argon2id with unique salts. The browser receives an opaque session token only in an HttpOnly, SameSite=Strict cookie; its hash is stored in SQLite. Sessions expire after seven days and survive API restarts. Logout deletes the session. Cookies are `Secure` when `NODE_ENV=production`, so production deployments need HTTPS. Invitation codes are generated from 32 random bytes and stored only as SHA-256 hashes. The API checks request origin and a custom request header on writes, rate-limits authentication and invitation endpoints, and allows credentialed CORS only from `FRONTEND_ORIGIN`. No auth secrets are stored in browser storage.

SQLite is not encrypted at rest. Protect the local `data/` directory and make backups outside Git. This is a local development website; any future remote deployment needs an HTTPS reverse proxy and an explicit operational security review.

## Checks

```powershell
npm run lint
npm run typecheck
npm test
npm run build
```

See [architecture](docs/architecture.md) for module boundaries, migrations, and the PostgreSQL path. The preserved visual reference is [design-preview.png](docs/design-preview.png).

Debt and bill payment amount presets, status handling, and payoff safeguards are described in [payment options](docs/payment-options.md).
