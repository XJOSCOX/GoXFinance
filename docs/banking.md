# Bank connectivity and transaction reconciliation

## Stage A — schema and authorization

Additive migration 0029 creates separate bank connections, account access assignments, dated balance observations, import batches, provider/inbox transactions, review requests, reconciliation links, transfers, refund adjustments/allocations, merchant rules and audit records. It adds compatible unique indexes to existing bill/debt payment identifiers; no financial records are replaced. Startup's existing verified backup gate runs before pending migrations. Migration tests reopen both SQLite modes and compare every existing table row.

Money is an exact safe integer in cents; date-only transaction dates remain YYYY-MM-DD and timestamps use UTC ISO-8601. Accounts and references use UUIDs; provider identifiers are opaque backend references. Monetary CHECK constraints reject fractional SQLite values. PostgreSQL can use UUID, BIGINT, timestamptz/date and equivalent FK/unique/check constraints in separate migrations; service logic does not depend on SQLite SQL.

Only the protected household Owner can create/edit bank profiles, hide accounts, assign access or record balance observations. Other active linked members see only explicitly assigned accounts. Admin does not imply bank access. Account observations do not create income, spending, bank transfers, assets or debt payments. Credit-card balances are liabilities, not cash. Mapping an account to an existing asset/debt is explicit and unique; mapped balances are not added automatically to net worth.

Banking API responses are whitelisted and never include stored access tokens, token ciphertext, token key identifiers or provider account IDs. There are no hard-delete routes. Existing data, authentication and encryption settings remain intact. External connectivity and accounting approvals will be enabled in subsequent independently tested stages; no live Plaid activity is authorized.
