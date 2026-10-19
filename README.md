# GoXPlan

GoXPlan is a local-first household finance dashboard and Tauri 2 desktop app for Windows. The desktop app stores records in SQLite on the current machine. There is no backend, account, or cloud sync.

![GoXPlan dashboard preview](docs/design-preview.png)

## Run locally

Requires Node.js 22 or newer. For the Windows desktop build, install Rust with the MSVC toolchain, Microsoft C++ Build Tools with Desktop development with C++, and WebView2.

```bash
npm install
npm run dev
```

The Vite URL remains available for legacy browser data export and UI development. To launch the SQLite desktop app:

```bash
npm run desktop:dev
```

To check a release build and create a Windows installer:

```bash
npm run lint
npm test
npm run build
npm run desktop:build
```

The installer is written under `src-tauri/target/release/bundle/nsis/`. SQLite is stored in Tauri's OS-specific application configuration directory under the bundle identifier `com.goxplan.desktop`. On Windows this is within the current user's AppData directory. Native SQLite snapshots are stored in its `backups` subdirectory. The desktop app is local and works offline. The browser development version still uses the old IndexedDB adapter so existing browser data can be exported; desktop persistence uses SQLite.

## Features

- Dashboard: monthly recurring take-home, expenses, debt minimums, remaining cash, known debt balances, overdue count, missing-data warnings, and a cash-flow projection.
- Local CRUD for household members, income, expenses, debts, actual payments, settlements, savings goals, and trading accounts.
- Debts include balance, APR, monthly minimum, status, due date, days late, security, settlement offer, collection agency, notes, owner reference, duplicate-original reference, and an edit history.
- Priority planner protects housing, utilities, food, transport, and legal obligations before debt minimums and optional settlements. Debt scores explain secured, legal, delinquency, collection, APR, fee, utilization, settlement, and user-urgency factors. Manual overrides remain editable.
- Payment calendar, interactive 12-month cash-flow forecast, payoff simulator, installment settlement schedules, one-time expenses, three-month emergency-fund target, and home savings goals with a VA readiness checklist and credit milestone.
- Trading records separate realized profit, payouts actually received, fees, tax reserves, drawdown, funded balance, and hypothetical projections. Aggregate trading figures are never automatically added to household recurring income. Enter dated trading withdrawals as payout transactions for the cash-flow forecast; do not also add them as income sources.
- Versioned JSON merge/export, optional password-encrypted JSON backup (AES-GCM with PBKDF2), native SQLite snapshots and verified merge restore, separate CSV tables, multi-sheet XLSX, and browser print summary. Every record carries a confirmed, estimated, or unverified label.
- Responsive navigation, search, editable forms, empty states, and light/dark themes.

## Financial conventions

Weekly pay uses `weekly × 52 ÷ 12`, rounded to cents. Biweekly, semimonthly, and annual values use their corresponding monthly equivalents. Variable or missing amounts are excluded from known totals and flagged for review. Forecasts repeat known monthly amounts; they are planning estimates, not bank balances.

Debt balance is a stock, monthly minimum is a scheduled obligation, and payment records represent actual cash paid. A collection record can point to its original debt ID; linked duplicates are excluded from active debt totals. Joint debt is one debt record and is counted once. Transfers and credit-card payment records are excluded from the `actualCashPaid` calculation to avoid counting them again on top of categorized spending. The dashboard uses scheduled expenses and minimums, never actual payments, in its recurring projection. Dated trading withdrawals enter the 12-month simulator only in their received month; hypothetical trading income remains a separate scenario.

Unknown amounts remain blank. The sample records appear **only** after choosing **Add example records** on the Data & backup screen and confirming. They contain the supplied weekly take-home, hourly rate, rent, electricity, Santander minimum, and three Topstep accounts with unknown balance and payout. No other debt values are invented.

## Privacy and backups

The desktop SQLite database stays on this machine, but **SQLite is not encrypted at rest**. Anyone with access to your Windows profile or disk may be able to read it. Native SQLite snapshots and plain JSON, CSV, and XLSX exports are also unencrypted. The optional password applies to JSON backups only; the password is never stored, exported, or recoverable. Keep backups somewhere you control. Import validates version 1 and 2 JSON backups, merges by UUID, and verifies imported IDs without deleting existing records. No password fields exist in the data schema.

### Move IndexedDB data to SQLite

1. Open the old web version in the **same browser profile and origin** that contains your IndexedDB records.
2. In **Data & backup**, export a complete JSON backup (optionally encrypted). Keep that file.
3. Open the Tauri desktop app. In **Data & backup**, select that file, enter its password if needed, and choose **Import backup**.
4. Review the records in the desktop app and create a SQLite snapshot. The old IndexedDB data and source backup are not deleted.

If the desktop WebView itself contains old GoXPlan IndexedDB records, **Check and migrate this WebView** can merge those directly after confirmation. The desktop WebView cannot read another browser's origin. See [storage architecture](docs/storage.md) for the migration and future PostgreSQL plan.

The VA checklist is a planning aid and makes no eligibility, rate, or approval promise. Confirm current requirements with the VA and a lender.

## Project structure

- `src/lib/schema.ts`: versioned Zod model.
- `src/lib/storage.ts`: database access port; desktop selects SQLite and browser development selects the legacy IndexedDB adapter.
- `src/lib/sqliteStorage.ts`: Tauri SQL plugin adapter with integer-cent conversion and UUID merge verification.
- `src/lib/legacyIndexedDb.ts`: isolated legacy browser adapter retained for migration.
- `src-tauri/migrations/`: versioned normalized SQLite schema.
- `src/lib/finance.ts`: financial calculations.
- `src/lib/export.ts`: JSON, encrypted JSON, CSV, and XLSX.
- `src/App.tsx`: dashboard and editors.
- `src/lib/*.test.ts`: calculations and export coverage.

Generated backups and `dist/` are gitignored. Do not commit personal financial records.
