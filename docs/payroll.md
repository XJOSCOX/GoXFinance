# Intelligent payroll inside Income

## Workflow

1. Add an employer/source first and use **Upload paycheck** on its card, or choose **Upload Paycheck** directly without a source. The review matches existing employer identities; ambiguous matches require selection. When no match exists, review the detected employer name and save the employer, payroll profile and paycheck together atomically. The new source belongs to your authorized active membership; no future income or hours are invented. You can also create or select an existing employment Income source. Open **Income → Payroll → Payroll settings**. Confirm employer, assignment, rates, workweek time zone, expected weekdays and individual deduction assumptions. The optional HireArt/Avride button only fills settings for review; it creates no source, paycheck or financial history.
2. **Report hours** for the actual pay period. Weekly, every two weeks, twice monthly, monthly, annual and custom periods are supported. Every two weeks means fourteen days; twice monthly follows calendar boundaries. Unclear schedules require review. Each paycheck snapshots its schedule; later employer setting changes preserve old periods. Enter regular and overtime hours explicitly; PTO, holiday and other paid time are separate. Rates are snapshotted. Save a draft or mark hours submitted; Payroll processing is a separate explicit milestone. Dates can be overridden for holidays/delays. The regular threshold is a reference, never assumed worked hours or an automatic PTO/overtime rule.
3. A versioned forecast saves gross calculated with integer-cent/fixed-hundredth arithmetic, component deductions, confidence and any observed-error range. Draft revisions append forecasts instead of rewriting them. Workweeks use the configured IANA time zone, including DST; expected weekdays do not create reminders or background jobs.
4. Choose **Upload paystub** for that week (or enter manually). File bytes are processed locally in a short-lived backend child process. Valid upload acceptance records the receipt milestone before extraction, preventing later forecasts being scored as earlier predictions. Review employer/source, dates, current and YTD columns, every line/classification, gross, employee deductions and net. Confirm any remaining discrepancy explicitly; missing totals cannot be saved.
5. Saving a reviewed statement creates or updates **one existing Income transaction**, pending/documented, with actual payroll amounts and historical work/rate fields. It does not confirm receipt. Existing matching work-period income is reused; normal Income uniqueness remains authoritative. A duplicate file/workweek is rejected rather than creating another paycheck.
6. **Confirm received** once when money arrives, with the printed payday and documented net prefilled. You can change either before submitting; there is no second receipt checkbox or confirmation dialog. Confirmed paychecks show a correction action instead of asking again. Normal Income validation/authorization and bank-reference guards apply. Documented net and actual received cash can differ; correcting a statement never silently changes a confirmed receipt. Correct the actual deposit separately with an audit reason. A reviewed bank deposit can later link/confirm this same transaction through the existing banking workflow.

## Military LES uploads

Military LES uploads suggest Salary as the pay basis. Review can change Salary/Hourly independently of the pay frequency. New salaried sources have no hourly rate; documented amounts are saved without requiring hours. Existing sources and older statement snapshots are preserved, and missing pay-basis information does not turn an unknown layout into salary automatically.

The local importer recognizes the parallel tables in DFAS military Leave and Earnings Statements (Form 702). It extracts current entitlements, deductions, net amount and explicitly reported YTD values. YTD-only tax, retirement and aggregate amounts stay informational and never become additional current earnings or deductions. Combined current FICA is preserved without guessing its Social Security/Medicare split. Unknown tax treatment still requires review.

The printed direct-deposit date (or `CHK DT`) supplies the suggested payday; service `PAY DATE` and `ETS` are never substituted. Explicit inactive-duty training dates can suggest the work-period span, with a review warning. Training units are not hours, and missing hourly rates stay unknown. The schedule defaults to irregular for review, without inventing future deposits. Saving an upload still creates pending income until receipt is confirmed. No private document or extracted personal fixture is included in source control.

## Calculations and learning

Hours use integer hundredths; monetary amounts use integer cents. BigInt intermediate arithmetic rounds half away from zero once per earnings line. Worked and paid hours are separate. Negative adjustments remain signed. No unpaid hours are subtracted from already entered worked hours automatically.

Deduction rules are independent components: unknown, fixed amount, configured percentage/base, or historical nearest-gross observation. Users explicitly mark non-applicable components. Federal, Social Security, Medicare, state and local withholding remain unknown unless configured; absence is never interpreted as zero. A percentage is a user-supplied assumption, not an implemented IRS W-4/table formula. Optional wage caps require explicit prior taxable wages; verify/update those per-week assumptions. Gross is not assumed to be the legal taxable base. Pretax benefits and traditional retirement can be excluded from a configured base only when those amounts are known. Roth/post-tax entries are not automatically pretax.

Historical mode averages the component amounts from up to five nearest-gross reviewed prior workweeks for the same source, with sample counts and out-of-range warnings. It does not apply one net/gross ratio or a fixed federal tax rate. Unreconciled/acknowledged discrepancy statements are excluded from training. Model versions snapshot selected statement observations, assumptions and prior forecast errors. Source changes and later corrections do not rewrite stored models/forecasts.

Only forecasts saved before document receipt and no later than a non-overdue expected payday qualify for accuracy. Old documents uploaded now do not manufacture prior predictions. Error is actual documented net minus saved forecast net; percentage uses actual net as denominator and is unknown for zero net. Three or more prior eligible errors provide an observed minimum/maximum error range, **not a statistical guarantee**. Comparisons show gross, federal, FICA, other deductions and net so users can identify observed variance components.

## Taxes and YTD

Payroll reports separate employee deductions from employer taxes. Signed negative-deduction layouts are preserved with an explicit statement sign convention. Earnings-side pretax disability amounts and corresponding deductions remain separate actual components; they are reconciled without counting either side twice. Tax treatment is user-reviewed rather than inferred for ambiguous labels.

YTD observations use the latest dated value per source/year/component/side, never the sum of separate paystubs. Missing values and decreases within a year are warnings; a new calendar year is a new cumulative series. Gross, documented net and observed net/gross ratios are reporting measures, not a filed return, annual liability or promised refund. Original statement versions and audit remain available after corrections; only the latest reviewed version contributes to current reports.

## Local extraction and privacy

Dependencies installed by `npm install`: Mozilla `pdfjs-dist`, `tesseract.js`, bundled English `@tesseract.js-data/eng`, and `@napi-rs/canvas`. Use Node.js 22.18 or newer on Windows with the package-provided native binaries. No separate Tesseract executable, Python, paid AI API or cloud extraction service is required. English OCR worker/core/language paths are local; no language downloads occur at runtime. Keep dependencies installed for offline use. The production build includes `apps/api/dist/modules/payroll/documents/worker.js` and shared build chunks; deploy the whole API dist directory, not just server.js.

Uploads allow signature-validated PDF, PNG and JPEG up to 10 MB, six PDF pages and 12 megapixels per rendered page/image. Image dimensions are checked before decode; extraction has a 90-second deadline, two-process global concurrency and one operation per user. The worker receives no database passphrase, Plaid credentials or authentication cookies. Worker output/errors are not logged. Malformed/encrypted/unsupported PDFs fail with a generic manual-entry message. There is no original document retention or raw-text response/storage; previews contain required financial fields only. Redact identifiers before uploading. Generic layouts and OCR can miss labels, dates, signs or decimal points; all values require review. No optional retained-document feature is enabled.

Official references: [PDF.js](https://github.com/mozilla/pdf.js), [PDF.js API](https://mozilla.github.io/pdf.js/api/draft/api.js.html), [local Tesseract configuration](https://github.com/naptha/tesseract.js/blob/master/docs/local-installation.md), [Tesseract API](https://github.com/naptha/tesseract.js/blob/master/docs/api.md).

## Storage and permissions

Additive migration 0031 adds profiles, weekly records, normalized statement lines and append-only statement/model/forecast/audit versions. Existing Income tables and confirmed trading payouts are unchanged. JSON snapshots contain validated financial/configuration fields, not extracted source text. Dates are ISO date-only; event timestamps are UTC ISO-8601; IDs are UUIDs, hours integer hundredths and amounts safe integer cents. Composite household foreign keys and unique work-period/document/income links prevent cross-household or duplicate records. PostgreSQL needs a separate dialect migration (UUID, BIGINT, date, timestamptz/JSONB) and an async transaction/repository adapter.

Owner and the source's active linked earner may read payroll details. Only existing authorized Income managers may write. Admin/Editor cannot use these routes to manage the protected Owner's source; Viewers cannot write and other households receive no data. Every write rechecks ownership, revision and scope in the same SQLite transaction as financial links and audit. Direct generic Income edits cannot alter documented payroll fields; separate deposit confirmation/correction remains available.

Startup creates and verifies the existing safety backup before pending migrations. Both plaintext and encrypted modes use the same schema/services. Original documents are not included in reports or backups; normalized financial records are sensitive and remain inside the existing database/backup protection.

## Manual QA before stable release

### Upload first

Open Income → **Upload Paycheck**, select a PDF/PNG/JPG, and extract locally. No reported-hours record or dates are required before upload. A configured issuer, assignment or reviewed historical issuer alias can match a source; ambiguous matches require explicit selection. If the existing source has no payroll profile, confirm its suggested rates and weekly schedule once within the same review. No source is created silently.

Review the compact earnings/tax/net summary; expand dates or line/YTD details for corrections. Missing dates/totals and uncertain classifications need review. **Save Paycheck** atomically creates or reuses a weekly record, appends a statement version, and creates/reuses one pending Income transaction. A distinct bank-deposit confirmation is still required. Document-only weeks have no invented prior forecast, and unavailable hours remain null. Changing actual statement amounts never replaces them with calculated earnings.

The expected bank date comes from the payroll schedule, independently of the printed statement date. Existing expected-date exceptions and immutable forecasts remain intact. Preview receipts are scoped to the authenticated user/household, signed, and expire after 30 minutes or an API restart; upload again after expiry. Revision checks reject settings/weeks changed after extraction. Retrying the same confirmed submission key returns the same paycheck; a reused key with different contents is rejected. Duplicate document fingerprints direct users to the existing paycheck. New imports with the same period require a new review and create audited statement versions rather than a second week or ledger entry.

The upload-first employer extension uses additive migration 0032 for persistent, household/user-scoped fingerprint receipts. Backward-compatible optional schedule fields remain in validated JSON snapshots. A preview persists only a fingerprint/first-seen receipt and audit, preserving the true forecast cutoff across cancelled or repeated previews. No week or Income transaction is created until confirmation. No original documents or raw text are retained.

- Test upload without a week, automatic source matching, ambiguous source selection, and missing-date correction.
- New uploads default their expected deposit to the printed payday. Existing recorded forecasts keep their own expected date; actual receipt date stays separate.
- Confirm review does not increase confirmed cash; a repeated save must not create another Income transaction.
- Import into a previously forecast week; verify forecasts stay unchanged and previously confirmed bank deposits remain untouched.
- Retry after an API restart; the expired preview must request a new upload without losing persisted financial history.

Use the isolated QA site at `http://localhost:1421` with synthetic or redacted documents. Do not import the private reference documents into a test fixture or commit any export.

- Create a fictional employment source, confirm its payroll settings, report fractional/variable hours, PTO and overtime, and save/revise a draft.
- Verify Sunday/Monday workweek boundaries and override an expected Thursday payday to Friday.
- Review a redacted text PDF, then a PNG/JPG/scanned PDF. Check every current amount, YTD, sign, gross, deductions, net and date against the document. Generic/unknown fields must remain unknown until corrected.
- Verify pending/documented Income does not increase confirmed cash. Confirm a separate actual deposit; ensure exactly one Income transaction appears.
- Correct an older statement, verify audit/history and confirm the earlier forecast remains unchanged. Correct a received deposit separately when necessary.
- Configure known fixed deductions and source-specific historical rules. Compare later predictions against actual paystubs; historical uploads must not be scored as earlier predictions.
- Review employee/employer separation, retirement/benefit components and latest YTD warnings, including a year boundary.
- Try duplicate workweeks/files, stale corrections, invalid totals and failed uploads; verify inputs/history are preserved and no partial financial entries remain.
- Check Owner/Admin/Editor/Viewer and unrelated-household access; restart, create/verify a backup and perform restore only on disposable QA data.

The module is ready for acceptance testing, not marked stable until this review is completed. Real paycheck data is never seeded into the repository or confirmed automatically.

## Upload identity and storage

Migration 0032 adds a household/user-scoped fingerprint receipt table. It records first document receipt across cancelled previews and restarts, without retaining file bytes or extracted raw text. UUID foreign keys, a document uniqueness index and UTC receipt timestamps preserve audit/forecast timing. Existing payroll tables and financial records are unchanged. The startup migration gate creates and verifies a safety backup before applying pending migrations. Employer creation, statement review, pending Income and audit commit together or roll back together.

The printed payday is an expected date, not proof of receipt. Only backend-confirmed deposits enter cash totals. Missing rates and deduction assumptions stay unknown. Monthly and irregular pay do not manufacture weekly processing milestones. Detection is a local extraction suggestion; review employer identity, dates, frequency and money before saving. Ambiguous fourteen-day versus twice-monthly dates require a schedule choice.
