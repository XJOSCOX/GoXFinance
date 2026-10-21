# Intelligent payroll inside Income

## Workflow

1. Add an employer/source first and use **Upload paycheck** on its card, or choose **Upload Paycheck** directly without a source. The review matches existing employer identities; ambiguous matches require selection. When no match exists, review the detected employer name and save the employer, payroll profile and paycheck together atomically. The new source belongs to your authorized active membership; no future income or hours are invented. You can also create or select an existing employment Income source. Open **Income → Payroll → Payroll settings**. Confirm employer, assignment, rates, workweek time zone, expected weekdays and individual deduction assumptions. The optional HireArt/Avride button only fills settings for review; it creates no source, paycheck or financial history.
2. **Report hours** for the actual pay period. Weekly, every two weeks, twice monthly, monthly, annual and custom periods are supported. Every two weeks means fourteen days; twice monthly follows calendar boundaries. Unclear schedules require review. Each paycheck snapshots its schedule; later employer setting changes preserve old periods. Enter regular and overtime hours explicitly; PTO, holiday and other paid time are separate. Rates are snapshotted. Save a draft or mark hours submitted; Payroll processing is a separate explicit milestone. Dates can be overridden for holidays/delays. The regular threshold is a reference, never assumed worked hours or an automatic PTO/overtime rule.
3. A versioned forecast saves gross calculated with integer-cent/fixed-hundredth arithmetic, component deductions, confidence and any observed-error range. Draft revisions append forecasts instead of rewriting them. Workweeks use the configured IANA time zone, including DST; expected weekdays do not create reminders or background jobs.
4. Choose **Upload paystub** for that week (or enter manually). File bytes are processed locally in a short-lived backend child process. Valid upload acceptance records the receipt milestone before extraction, preventing later forecasts being scored as earlier predictions. Review employer/source, dates, current and YTD columns, every line/classification, gross, employee deductions and net. Confirm any remaining discrepancy explicitly; missing totals cannot be saved.
5. Saving a reviewed statement creates or updates **one existing Income transaction**, pending/documented, with actual payroll amounts and historical work/rate fields. It does not confirm receipt. Existing matching work-period income is reused; normal Income uniqueness remains authoritative. A duplicate file/workweek is rejected rather than creating another paycheck.
6. **Confirm received** once when money arrives, with the printed payday and documented net prefilled. You can change either before submitting; there is no second receipt checkbox or confirmation dialog. Confirmed paychecks show a correction action instead of asking again. Normal Income validation/authorization and bank-reference guards apply. Documented net and actual received cash can differ; correcting a statement never silently changes a confirmed receipt. Correct the actual deposit separately with an audit reason. A reviewed bank deposit can later link/confirm this same transaction through the existing banking workflow.

## Military LES uploads

The Income overview's YTD card defaults to All employers, combining matching categories from the latest reported YTD observations for each employer in the selected year. The employer selector can show one employer instead. Combined deductions normalize each statement's printed sign convention so withholding adds correctly while documented credits reduce it. Missing amounts remain unknown, and partial totals are explicitly marked as reported subtotals. Equivalent federal, Social Security and Medicare labels share one component per employer/year; different state taxes and retirement plans retain their identities. Explicit military YTD-only tax and TSP details are included for display without creating current-period deductions. Combined FICA is hidden when equally recent or newer Social Security and Medicare YTD figures provide its breakdown. Unreported YTD amounts are grouped separately and remain unknown. These are read-only reporting projections; saved statements and payment totals are never rewritten.

Military LES uploads suggest Salary as the pay basis. Review can change Salary/Hourly independently of the pay frequency. New salaried sources have no hourly rate; documented amounts are saved without requiring hours. Existing sources and older statement snapshots are preserved, and missing pay-basis information does not turn an unknown layout into salary automatically.

The local importer recognizes the parallel tables in DFAS military Leave and Earnings Statements (Form 702). It extracts current entitlements, deductions, net amount and explicitly reported YTD values. YTD-only tax, retirement and aggregate amounts stay informational and never become additional current earnings or deductions. Combined current FICA is preserved without guessing its Social Security/Medicare split. Unspecified tax treatment is shown as a warning and remains unknown; reconciled amounts can be saved without a discrepancy acknowledgement. Missing financial amounts, inconsistent totals and unrecognized component classifications still require correction or explicit acknowledgement where allowed.

The printed direct-deposit date (or `CHK DT`) supplies the suggested payday; service `PAY DATE` and `ETS` are never substituted. Explicit inactive-duty training dates can suggest the work-period span, with a review warning. Training units are not hours, and missing hourly rates stay unknown. The schedule defaults to irregular for review, without inventing future deposits. Saving an upload still creates pending income until receipt is confirmed. No private document or extracted personal fixture is included in source control.

## Calculations and learning

Forecast learning is isolated by the selected income source UUID and pay frequency. HireArt or another hourly employer uses only its own reviewed, reconciled prior paychecks; military salary and other jobs are excluded even when they share the same frequency or tax categories. The combined-employer YTD view is a reporting projection and is never a forecast training input. New same-employer paychecks can improve future deduction estimates; existing forecasts retain their original amounts and model observations. Estimates remain dependent on supplied hours/rates and the available history, rather than guaranteeing future take-home pay.

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

## Forecasting v2 (Phase 16)

The shared pipeline is split into arithmetic, forecast calculation, source-specific learning, payroll tax rules, and a separate read-only backtest. Existing saved model/forecast JSON remains readable. No migration, actual paycheck correction, confirmed-deposit rewrite, or bank configuration change is needed.

### Automatic calculations versus approved settings

- Exact clock minutes and decimal hundredths remain distinct. Hour classifications, pay dates and rates are explicit inputs.
- Historical deductions use reviewed, reconciled, earlier-period observations from the same source and frequency. Bonus and ordinary samples are separated. Federal withholding interpolates between comparable bracketing gross amounts, uses exact-gross observations where available, and otherwise falls back to up to five nearest-gross samples. Extreme effective-rate outliers are flagged. Fewer than three observations retain the legacy total-ratio estimate when the user selected historical estimation and no explicit deduction rule would be overridden.
- Component history estimates only the deductions actually observed; it does not assert that every possible tax or benefit applies. New or changed benefit elections can make that assumption wrong. Confidence is unknown/low/medium; the application never guarantees a paycheck.
- Three consistent ordinary observations can suggest fixed earnings additions, fixed benefit deductions or a contribution rate. These are proposals only. In Payroll settings, approve additions and deduction rules, then save explicitly. Disable an approved addition with its checkbox. User-entered additional earnings suppress approved additions to avoid counting the same amount twice; review the explanation.
- A configured contribution can use gross less approved recurring additions. Pretax treatment and FICA taxable wages are different assumptions. Payroll tax mode accepts only explicitly confirmed gross-as-taxable or explicit taxable wages, prior employer taxable wages, tax year and the target payday. Missing/stale/unsupported inputs remain unknown. No W-4 tax-table engine is claimed.
- Official employee payroll-tax mode currently supports 2026 only: Social Security 6.2% up to $184,500, Medicare 1.45%, and Additional Medicare withholding 0.9% over $200,000 of employer wages. Sources: [IRS Topic 751](https://www.irs.gov/taxtopics/tc751), [SSA wage bases](https://www.ssa.gov/OACT/cola/cbb.html), [IRS Publication 15](https://www.irs.gov/publications/p15). Employer contributions are not employee deductions.

### Saved estimates and history

The Next estimated paycheck card exposes Upload paycheck and Edit / delete estimate in its top-right action area. Editing appends a forecast and preserves previous versions. Deleting hides only an estimate with no statement receipt, reviewed document or linked Income record; it retains the hours, immutable forecasts and audit event in SQLite. A new estimate for the same period can reactivate that draft with a new revision. Revision checks and household/earner authorization run inside the transaction. Paychecks and deposits cannot be deleted through this endpoint. Recent paychecks show at most five rows with Previous/Next navigation.

Expand How this estimate is calculated for earnings, methods, deductions, sample counts, confidence and the exact gross/deductions/net reconciliation. Older forecasts retain their original amounts and methods. Editing hours can refresh the estimate using current approved settings; opening a card does not recalculate history.

### Historical backtest

Payroll → Taxes & comparison → Historical forecast backtest is read-only. The exported `payrollBacktest` utility sorts same-source observations chronologically, assumes each was available on its printed payday, and trains strictly on earlier paydays. It uses the target's actual reported hours and explicit one-time earnings as conditional inputs. Later-approved rules are excluded. Incomplete hours/rates/earnings are skipped. This is not evidence of a forecast saved before receiving the statement.

Synthetic fixture: ten fictional weekly statements with varying regular wages, a $3 earnings/premium pair, 7% retirement contributions and a separate one-time award. Eight ordinary periods have evaluable net forecasts; the first ordinary period and the first bonus lack comparable prior observations. Net MAE is **$36.75**, median absolute net error **$20.79**. The bonus has no evaluated net prediction, not zero error. These numbers describe this small synthetic baseline, not the user's payroll accuracy. Per-period gross, each deduction, net, absolute/percentage errors and sample-size groups are available in the report. No private document amounts are used in these fixtures.

### Manual review

1. Open Income and inspect the saved estimate; expand its calculation and verify gross minus deductions equals take-home.
2. Use Edit / delete estimate → Edit, change hours/minutes or payday, and save a correction note. Refresh and verify the latest estimate; prior forecasts remain under Payroll history.
3. In Payroll settings, review employer-specific suggestions. Approve additions/rules deliberately and save; report revised hours to create a new snapshot. Another employer must retain its own settings.
4. Upload the actual paystub against the draft and review it. The actual totals remain separate until confirmed received; the draft is then no longer editable/deletable through estimate actions.
5. In disposable QA, delete an estimate and refresh. Verify it disappears from upcoming estimates without changing confirmed income. Recreate its period if needed; audit history remains.
6. Browse recent-paycheck pages and check the mobile navigation drawer. No browser storage is used for financial records.


### Verification

Validated on October 20, 2026: lint, typecheck and production build passed; 182 test files / 678 tests passed with two workers and a 30-second test timeout. The production build retains the existing large-chunk advisory. Browser QA at localhost:1421 confirmed a fictional estimate correction, the guarded delete dialog, expanded calculations, desktop header actions and mobile navigation without horizontal overflow. Plaintext/encrypted cancellation, authorization, restart and existing backup/recovery coverage passed. The normal encrypted launcher restarted successfully; no real paycheck, estimate, rules, deposit or bank record was modified during the read-only real-account review.


## Comparing an uploaded actual paycheck

After uploading and reviewing a paycheck against its existing draft, the pay-period card shows **Paycheck vs saved estimate** with the frozen take-home forecast, documented paystub net, and a higher/lower/matching difference. The latest-paycheck/details card also shows this comparison when that paycheck is selected. Gross and deduction differences expand separately. A documented paycheck is not treated as a confirmed bank deposit.

The baseline is the latest accuracy-eligible forecast saved before the first statement receipt, with model version resolving timestamp ties. Uploading an actual does not replace that baseline or any previous forecast. A changed/reconciled work period, missing net, or a forecast created after document receipt is not scored as a prior prediction.

Reviewed, reconciled same-source paychecks become observations for subsequently created or revised estimates. Source UUID, pay frequency, earlier work period and review timestamp are checked; military payroll cannot enter another employer's sample pool. Bonus comparisons remain separate from ordinary-pay learning. Existing saved future drafts are not silently rewritten when a new document arrives.

Synthetic regressions cover higher/lower/equal differences, unknowns, post-receipt forecasts, changed periods, same-timestamp versions, matched draft upload, pending deposit status, employer isolation and restart persistence in plaintext and encrypted SQLite. No real paycheck upload is fabricated to demonstrate the comparison.

Verification for the comparison update: 184 test files / 684 tests passed; lint, typecheck and production build passed. The encrypted app restarted successfully. No actual paycheck, confirmed deposit, employer settings or saved estimate was changed while implementing this display.
