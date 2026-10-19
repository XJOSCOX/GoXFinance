# Final local manual testing

Completed on 2026-10-19 against the production website bundle at `http://localhost:1421`, using the in-app browser. **9/9 checklist items passed.** These were actual UI interactions with a real SQLite database and a stopped/restarted API, not simulated test results.

## Isolation

The test used a dedicated temporary directory, `goxfinance-manual-20261019-9checks`, under the operating system temporary directory. The database was `qa.sqlite`. All accounts, members, debt amounts, and payments were fictional. The normal development database was not used. No database, backup, invitation code, password, or screenshot is included in this commit.

## Results

| Check | Result and observed evidence |
| --- | --- |
| Create an account and household; log out and back in | Passed. Created Manual Owner and Manual QA Home through signup/setup, then successfully logged out and authenticated again. |
| Add a member, invite them, accept the code | Passed. Owner added Manual Admin with planned Admin access, generated a code, and the second fictional account redeemed it during signup. The existing member became linked. Invitation generation/redemption was explicitly approved by the user. |
| Admin cannot manage or remove Owner | Passed in the UI. As Admin, the Owner card exposed View only; no edit, role, invitation, deactivation, or removal controls. Backend enforcement is additionally covered by the automated security tests. |
| Submit a member proposal; approve as Owner | Passed. Admin proposed Manual Proposed Member with notes. Owner saw the pending request before a member existed, approved with default Viewer access, and one member appeared. The approved request remained visible. No invitation was generated for this member. |
| Create, edit, archive, restore a fictional debt | Passed. Created Manual Fictional Credit Union with a $1,000 balance and both Owner/Admin associated. Edited its nickname, confirmed archival, opened the archived register, and confirmed restoration. The edited nickname persisted. Shared associations counted once in household totals. |
| Record and confirm a payment; verify history | Passed. A scheduled $100 payment ($80 principal, $20 interest) left completed totals at zero. Confirmation changed totals to $100/$80. Recorded a verified $920 creditor balance; both the initial $1,000 and verified $920 entries remained in history. |
| Owner approval on a jointly held debt | Passed for the debt associated with both Owner and Admin. Admin requested a correction to $120 total/$100 principal. Pending request left payment totals at $100/$80. Owner reviewed current/proposed values and approved; the original payment became $120/$100. Changes listed Created, Confirmed, and Edited events. |
| Create and verify a backup through recovery UI | Passed. Owner clicked Database recovery, then Create backup. UI displayed “Verified database backup created” and a timestamped snapshot with Restore available. No restore was requested or performed in this manual run. |
| Restart API; confirm records persist | Passed. Stopped the API process and started a new process using the same QA directory. Browser refresh retained the valid login, three members, approved proposal, debt/nickname, approved correction, payment, and both balance-history entries. |

## Verification commands

All passed after the manual run:

- `npm --script-shell=cmd.exe run lint`
- `npm --script-shell=cmd.exe test` — 66 tests across 19 files
- `npm --script-shell=cmd.exe run build` — includes API/web TypeScript checks and both production bundles

The explicit script shell was necessary for the shell configuration on this Windows host. Vite emitted harmless third-party Zod annotation warnings and completed successfully.

## Repeating the isolated run

Build first, then run from the repository root in PowerShell:

```powershell
npm --script-shell=cmd.exe run build
$env:QA_DATA_DIR = Join-Path $env:TEMP ('goxfinance-manual-' + [guid]::NewGuid())
node --import tsx apps/api/src/testing/browser-server.ts
```

Open `http://localhost:1421`. With `QA_DATA_DIR` set, the harness starts without seed accounts and retains only its dedicated `qa.sqlite` and recovery snapshots across shutdowns. Reuse the same environment variable when restarting. Choose a fresh QA directory for a new test; never point it at a user database directory. Without this variable, the existing seeded, disposable browser-test behavior is preserved.

## Limits

This checklist does not certify production security or replace automated adversarial tests. Browser automation exercised the visible controls; direct crafted-request restrictions were covered by the passing integration tests. Recovery restoration, interrupted writes, and invalid snapshots remain automated-test coverage rather than manual restoration in this run. Date-only records cannot resolve same-day posting order: the verified balance and payment both dated October 19 correctly produced an overlap warning and an unknown principal-only estimate. No real financial transactions or external accounts were involved.
