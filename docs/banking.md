# Bank connectivity and transaction reconciliation

## Stage A — schema and authorization

Additive migration 0029 creates separate bank connections, account access assignments, dated balance observations, import batches, provider/inbox transactions, review requests, reconciliation links, transfers, refund adjustments/allocations, merchant rules and audit records. It adds compatible unique indexes to existing bill/debt payment identifiers; no financial records are replaced. Startup's existing verified backup gate runs before pending migrations. Migration tests reopen both SQLite modes and compare every existing table row.

Money is an exact safe integer in cents; date-only transaction dates remain YYYY-MM-DD and timestamps use UTC ISO-8601. Accounts and references use UUIDs; provider identifiers are opaque backend references. Monetary CHECK constraints reject fractional SQLite values. PostgreSQL can use UUID, BIGINT, timestamptz/date and equivalent FK/unique/check constraints in separate migrations; service logic does not depend on SQLite SQL.

Only the protected household Owner can create/edit bank profiles, hide accounts, assign access or record balance observations. Other active linked members see only explicitly assigned accounts. Admin does not imply bank access. Account observations do not create income, spending, bank transfers, assets or debt payments. Credit-card balances are liabilities, not cash. Mapping an account to an existing asset/debt is explicit and unique; mapped balances are not added automatically to net worth.

Banking API responses are whitelisted and never include stored access tokens, token ciphertext, token key identifiers or provider account IDs. There are no hard-delete routes. Existing data, authentication and encryption settings remain intact. External connectivity and accounting approvals will be enabled in subsequent independently tested stages; no live Plaid activity is authorized.

## Stage B — manual imports and inbox

Bank accounts and Transactions are separate sidebar pages. Owners create manual profiles, record append-only balance observations and assign account visibility. Statement import supports mapped CSV and a limited, closed-STMTTRN OFX/QFX parser; external entities/DTDs, excessive statements, ambiguous dates and fractional cents are rejected. Account currency must match. Raw statements and full account numbers are not persisted; reference identifiers are hashed, and long numeric identifiers in descriptions are masked.

Preview selects valid rows, skips previously imported fingerprints, requires explicit selection/confirmation of possible same-date/same-amount duplicates, and rejects stale account previews. Identical legitimate rows within one statement remain distinct. Submission keys, transactional duplicate checks and audit writes prevent repeated or partially saved imports. Unreviewed/pending transactions never create accounting entries. Imported data remains available after restart in plaintext and encrypted databases. Suggestions are explainable keywords only at this stage; final accounting review and existing-record matching are added in Stage D.

Fictional QA verified account creation, CSV mapping, signed preview amounts and inbox persistence at localhost:1421; no real account or statement was used. OFX support deliberately ignores institution account headers and does not support every vendor extension. CSV remains the fallback.
