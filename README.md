# GoXFinance

GoXFinance is a local website with account authentication and household management. Users can create a household, manage its members, and view an empty dashboard. It has no financial records or cloud integration yet.

## Run locally

Install Node.js 22 or newer. From the repository root:

```powershell
npm install
npm run dev
```

Open **http://localhost:1420**. Vite serves the website and forwards `/api` requests to Fastify at `http://127.0.0.1:3001`. The API creates and migrates `data/goxfinance_web.sqlite` on startup. Household migrations are additive; existing accounts, sessions, households, and members stay in place. The `data/` directory and SQLite WAL/SHM files are ignored by Git. The prior Tauri database, if present in the OS app data directory, is not opened, migrated, or deleted.

Copy `.env.example` to `.env` to change the API port, frontend origin, or local data directory. If you change the API port, update the Vite proxy in `apps/web/vite.config.ts` as well. Run `npm run build` for production bundles; the website is emitted to `apps/web/dist` and the API to `apps/api/dist`. Run `npm run start:api` to start the built API. A production web server must serve `apps/web/dist`, forward `/api` to Fastify, and fall back to `index.html` for app routes, including `/household/setup`, `/household/join`, and `/households/:householdId/members`.

## Households

After signing in, an account without a household is sent to the setup page. Creating a household also assigns the creator the Owner role and creates their linked member record in one transaction. Repeating setup returns the existing household. The Household sidebar link opens the house and its people in one card. Authorized users can add, edit, view, deactivate, and reactivate members. Removing a linked member revokes that account's access to this household and retains an inactive member record; the account and its other households remain intact. Reactivating the record does not restore access. Household members need no email or password.

Owners and admins can generate an invitation for an active, unlinked member and assign Admin, Editor, or Viewer access. The code is displayed only when issued or regenerated; copy it then and share it privately. It expires after seven days, works once, and can be revoked. Regeneration invalidates the old code. A new user can choose **Join with code** at signup; an existing user can use **Join household** on the Household page. Redemption links the account to the original member record without changing its profile. The API enforces Owner, Admin, Editor, and Viewer permissions. There is no general role editor or email invitation delivery yet. A user with one household sees it by default; users with multiple households can select one in the sidebar. The dashboard remains empty until future finance features are added.

The Household page shows the selected house with its members inside the same card. **Details** shows its creation date, member count, move-in date, and notes. Authorized users can use **Edit household** to change its name, optional move-in date, and notes. Existing households start with those optional fields empty; no move-in date is inferred.

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
