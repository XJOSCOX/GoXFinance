# GoXFinance

GoXFinance is a local website foundation with signup, login, logout, and an empty authenticated dashboard. It has no financial records or cloud integration yet.

## Run locally

Install Node.js 22 or newer. From the repository root:

```powershell
npm install
npm run dev
```

Open **http://localhost:1420**. Vite serves the website and forwards `/api` requests to Fastify at `http://127.0.0.1:3001`. The API creates and migrates `data/goxfinance_web.sqlite` on first startup. The `data/` directory and SQLite WAL/SHM files are ignored by Git. The prior Tauri database, if present in the OS app data directory, is not opened, migrated, or deleted.

Copy `.env.example` to `.env` to change the API port, frontend origin, or local data directory. If you change the API port, update the Vite proxy in `apps/web/vite.config.ts` as well. Run `npm run build` for production bundles; the website is emitted to `apps/web/dist` and the API to `apps/api/dist`. Run `npm run start:api` to start the built API. A production web server must serve `apps/web/dist`, forward `/api` to Fastify, and fall back to `index.html` for `/login`, `/signup`, and `/dashboard`.

## Security and storage

Accounts and sessions are stored in server-side SQLite. Passwords use Argon2id with unique salts. The browser receives an opaque session token only in an HttpOnly, SameSite=Strict cookie; its hash is stored in SQLite. Sessions expire after seven days and survive API restarts. Logout deletes the session. Cookies are `Secure` when `NODE_ENV=production`, so production deployments need HTTPS. The API checks request origin and a custom request header on writes, limits signup/login attempts, and allows credentialed CORS only from `FRONTEND_ORIGIN`. No auth secrets are stored in browser storage.

SQLite is not encrypted at rest. Protect the local `data/` directory and make backups outside Git. This is a local development website; any future remote deployment needs an HTTPS reverse proxy and an explicit operational security review.

## Checks

```powershell
npm run lint
npm run typecheck
npm test
npm run build
```

See [architecture](docs/architecture.md) for module boundaries, migrations, and the PostgreSQL path. The preserved visual reference is [design-preview.png](docs/design-preview.png).
