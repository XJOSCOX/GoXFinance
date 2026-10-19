# GoXPlan

GoXPlan is a Windows desktop foundation for private household finance software. This version contains local account creation, login, and an empty dashboard. It does not contain financial records or cloud services.

## Run on Windows

Install Node.js 22+, Rust with the MSVC toolchain, Microsoft C++ Build Tools, and WebView2. Then run:

```powershell
npm install
npm run desktop:dev
```

Build an installer with `npm run desktop:build`. The NSIS installer is generated in `src-tauri/target/release/bundle/nsis/`. `npm run dev` opens a frontend preview that deliberately refuses signup/login because SQLite and authentication require Tauri.

## Storage and security

The sole application database is `goxfinance_auth.sqlite` in Tauri's operating-system app data directory for `com.goxplan.desktop` (normally `%APPDATA%\com.goxplan.desktop\` on Windows). This is distinct from the previous `goxplan.sqlite`; the previous database is neither opened nor deleted. No old financial data is migrated automatically.

The Rust backend owns every database query. SQLite stores a UUID, normalized unique email, full name, Argon2id password hash with a unique salt, and UTC timestamps for each user. Passwords and hashes are never returned to React. Login creates a random session token held only in process memory. Logout invalidates it; closing the app requires signing in again. SQLite is not automatically encrypted at rest. Protect your Windows account and disk accordingly.

The migration in `src-tauri/migrations/0001_auth.sql` creates only `users` and `schema_migrations`. Future migrations should be additive and versioned. UUID keys and ISO UTC timestamps are portable to PostgreSQL. There is no Supabase integration, cloud sync, or browser storage.

## Checks

```powershell
npm run lint
npm test
npm run build
cd src-tauri
cargo test
cargo check
```

Routing lives in `src/App.tsx`, screens in `src/pages/`, and shared UI in `src/components/`. Input validation and the controlled Tauri command client are in `src/lib/auth.ts`. Native authentication, database migration, and session enforcement are in `src-tauri/src/auth.rs`, `db.rs`, and `lib.rs`.
