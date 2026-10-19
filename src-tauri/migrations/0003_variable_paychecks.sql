-- Additive paycheck history. Amounts and historical transactions are retained.
ALTER TABLE income_sources ADD COLUMN pay_type TEXT NOT NULL DEFAULT 'salaried';
UPDATE income_sources SET pay_type = 'hourly' WHERE hourly_rate_cents IS NOT NULL;
UPDATE income_sources SET pay_type = 'variable' WHERE frequency = 'variable' AND hourly_rate_cents IS NULL;
ALTER TABLE income_transactions ADD COLUMN gross_cents INTEGER CHECK(gross_cents IS NULL OR gross_cents >= 0);
ALTER TABLE income_transactions ADD COLUMN deductions_cents INTEGER CHECK(deductions_cents IS NULL OR deductions_cents >= 0);
ALTER TABLE income_transactions ADD COLUMN regular_hours REAL CHECK(regular_hours IS NULL OR regular_hours >= 0);
ALTER TABLE income_transactions ADD COLUMN overtime_hours REAL CHECK(overtime_hours IS NULL OR overtime_hours >= 0);
ALTER TABLE income_transactions ADD COLUMN overtime_multiplier REAL NOT NULL DEFAULT 1.5 CHECK(overtime_multiplier >= 1);
ALTER TABLE income_transactions ADD COLUMN hourly_rate_snapshot_cents INTEGER CHECK(hourly_rate_snapshot_cents IS NULL OR hourly_rate_snapshot_cents >= 0);
ALTER TABLE income_transactions ADD COLUMN work_period_start TEXT;
ALTER TABLE income_transactions ADD COLUMN work_period_end TEXT;
ALTER TABLE income_transactions ADD COLUMN confirmation_date TEXT;
CREATE UNIQUE INDEX idx_income_paycheck_period ON income_transactions(source_id, work_period_start, work_period_end)
  WHERE source_id IS NOT NULL AND work_period_start IS NOT NULL AND work_period_end IS NOT NULL;
CREATE INDEX idx_income_deposit_date ON income_transactions(date);
CREATE TABLE income_transaction_revisions (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL REFERENCES households(id),
  income_transaction_id TEXT NOT NULL REFERENCES income_transactions(id),
  name TEXT NOT NULL,
  previous_snapshot TEXT NOT NULL,
  next_snapshot TEXT NOT NULL,
  date TEXT NOT NULL,
  reason TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  confidence TEXT NOT NULL DEFAULT 'confirmed',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_income_revisions_transaction ON income_transaction_revisions(income_transaction_id, date);
INSERT INTO app_schema_versions (version, applied_at) VALUES (3, strftime('%Y-%m-%dT%H:%M:%fZ','now'));
