# Architecture

- `apps/web/src/app`: routing and dashboard gate. `features/auth` owns account screens, API client, and session state. `features/dashboard` owns the empty authenticated screen. Reusable visual components live in `components/ui` and `components/layout`; the preserved dark palette is in `styles`.
- `apps/api/src/modules/auth`: routes declare endpoints, controllers translate HTTP/cookies, the service handles identity and sessions, and the repository is the only auth query layer. `middleware/csrf.ts` enforces same-origin writes. `config` and `db` own configuration and connection lifecycle.
- `packages/shared`: Zod input contracts and public user types shared by website and API. No password hashes or session secrets appear in public types.
- `packages/db`: Drizzle SQLite schema and generated, versioned migrations. IDs are UUID text and timestamps use UTC ISO 8601 strings. Expiration uses Unix seconds. Migrations are applied on API startup.

The new website database is `data/goxfinance_web.sqlite`; old desktop SQLite files stay in their existing location. The site does not import old finance records or use browser databases. Login state is rechecked through `GET /api/auth/me` on page load.

For future Supabase PostgreSQL support, define a separate Drizzle PostgreSQL schema and migrations, map the existing UUID IDs and UTC timestamps, and move the repository implementation to the PostgreSQL driver. Keep service and HTTP contracts unchanged. Plan a versioned, audited data migration with duplicate prevention before moving any user records. Supabase credentials, sync, and authentication are intentionally absent.
