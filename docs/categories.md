# Household financial categories

## Catalog and permissions

`expense_categories` is now the central financial category catalog. Its legacy physical name is retained to preserve existing category UUIDs and allocation foreign keys. There is no second catalog. The API and UI call these financial categories.

Each household receives the 20 standard financial categories. Existing labels such as `Health` and `Food & Dining` remain distinct legacy categories; they are not silently renamed, merged, or reassigned. Only the Owner can create, rename, archive, restore, or change category metadata. All household members can read categories. Assignment changes remain subject to each financial module's permissions. Admins, Editors, and Viewers cannot manage the catalog. There is no category deletion endpoint.

Names are normalized with NFKC, whitespace normalization and case folding in the service. A household/name key is also unique in SQLite. Archived names remain reserved. Updates require a revision and execute in an immediate transaction; stale updates return a conflict.

## Assignments and historical records

- Bills and billing periods have a nullable category UUID in addition to the original label. Migration matches existing labels within the same household, creates categories for unmatched labels, and uses Other only for a blank label. Period labels and amounts remain untouched. Future periods snapshot the bill's selected category and label.
- Debts have an optional category independent of account type. No category is guessed from a creditor name. Existing Owner protection, stale-request checks and approval transactions cover category changes.
- Expense allocations retain their original category IDs and amounts. Archived categories remain usable for unchanged historical assignments, but cannot be newly assigned. Split allocations still must equal the purchase amount.
- Foreign keys preserve references. Additional insert/update triggers reject cross-household category assignments on bills, periods and debts. Services validate category ownership, archival and financial-record permissions independently on each request.

Renaming a category changes its catalog display name, not historical bill-period labels, transaction allocations, financial amounts or audit JSON. Usage counts include historical and archived/voided record references so those references remain visible.

Pending pre-migration debt and bill approvals remain reviewable when the only snapshot difference is the newly added category association. The compatibility comparison retains amounts, revisions, timestamps, payments, and related audit entries. Newly assigned debt categories and changes to modern category-aware requests still invalidate stale approvals.

## Reporting

Manage Categories is available from Bills, Expenses and Debts. The searchable selector can open management and create a category without discarding a financial form. The optional Category Totals view keeps four columns separate:

1. Current expected monthly obligations, including budget estimates.
2. Actual purchase spending in the selected month, including credit-card purchases.
3. Completed cash outflows in the selected month.
4. Current known outstanding debt balances.

These columns must not be added together. Linked recurring debt obligations replace the same debt minimum. Authoritative linked debt payments own the cash outflow, while a credit-card purchase is spending and its later repayment is not another purchase. Unknown amounts are counted separately. Historical bill payments use their period's category association, and expense purchases use their allocations.

## Migration and recovery

Additive migration `0015_unified_financial_categories.sql` adds metadata and nullable associations, backfills labels, and adds indexes and household guards. Earlier released migrations are unchanged. It does not rebuild tables, delete records, change encryption mode, replace the database file, or recalculate financial amounts.

The existing database opener creates and independently verifies a pre-migration snapshot before applying pending migrations to a populated financial database. Snapshots remain in the ignored `data/backups` directory beside the configured database. Encrypted mode uses the current key and encrypted snapshots; legacy plaintext mode remains plaintext. Neither conversion nor restore is part of this feature.

If legacy categories already conflict after case-insensitive normalization, migration fails and rolls back instead of deleting, merging or renaming records. Preserve the verified backup and resolve the conflicting legacy names deliberately before retrying. Tests exercise successful migration and rollback in both database modes, historical IDs/labels/allocations, permissions, approvals, restarts, and accounting separation.

## PostgreSQL readiness

UUID relationships, normalized unique names, booleans, revisions, integer cents and UTC timestamp strings are portable concepts. A PostgreSQL migration should preserve UUIDs, use native UUID/timestamptz/boolean types, retain household-scoped uniqueness and replace the SQLite assignment triggers with composite foreign keys on `(category_id, household_id)`. SQLite UUID generation and label backfill SQL are confined to this dialect's migration. No Supabase connection, authentication, synchronization, or credentials were added.
