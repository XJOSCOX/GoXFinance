-- Additive migration. Existing money and identifiers are retained without recalculation.
ALTER TABLE bank_accounts ADD COLUMN initial_balance_cents INTEGER CHECK(initial_balance_cents IS NULL OR initial_balance_cents >= 0);
ALTER TABLE bank_accounts ADD COLUMN confirmed_balance_cents INTEGER CHECK(confirmed_balance_cents IS NULL OR confirmed_balance_cents >= 0);
ALTER TABLE bank_accounts ADD COLUMN confirmed_at TEXT;
ALTER TABLE bank_accounts ADD COLUMN confidence TEXT NOT NULL DEFAULT 'confirmed';
ALTER TABLE debts ADD COLUMN verified_balance_cents INTEGER CHECK(verified_balance_cents IS NULL OR verified_balance_cents >= 0);
ALTER TABLE debts ADD COLUMN verified_at TEXT;
ALTER TABLE debts ADD COLUMN link_verified INTEGER NOT NULL DEFAULT 0;
ALTER TABLE debt_payments ADD COLUMN bank_account_id TEXT REFERENCES bank_accounts(id);
ALTER TABLE settlement_payments ADD COLUMN bank_account_id TEXT REFERENCES bank_accounts(id);
ALTER TABLE trading_transactions ADD COLUMN bank_account_id TEXT REFERENCES bank_accounts(id);
ALTER TABLE income_transactions ADD COLUMN confidence TEXT NOT NULL DEFAULT 'confirmed';
ALTER TABLE expense_transactions ADD COLUMN category_id TEXT REFERENCES categories(id);
ALTER TABLE monthly_budgets ADD COLUMN confidence TEXT NOT NULL DEFAULT 'confirmed';
ALTER TABLE categories ADD COLUMN confidence TEXT NOT NULL DEFAULT 'confirmed';

CREATE TABLE bank_transfers (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL REFERENCES households(id),
  from_account_id TEXT NOT NULL REFERENCES bank_accounts(id),
  to_account_id TEXT NOT NULL REFERENCES bank_accounts(id),
  name TEXT NOT NULL,
  amount_cents INTEGER NOT NULL CHECK(amount_cents > 0),
  date TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  confidence TEXT NOT NULL DEFAULT 'confirmed',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK(from_account_id <> to_account_id)
);
CREATE TABLE saved_scenarios (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL REFERENCES households(id),
  name TEXT NOT NULL,
  start_month TEXT NOT NULL,
  starting_cash_cents INTEGER NOT NULL,
  monthly_emergency_savings_cents INTEGER NOT NULL CHECK(monthly_emergency_savings_cents >= 0),
  monthly_extra_debt_payment_cents INTEGER NOT NULL CHECK(monthly_extra_debt_payment_cents >= 0),
  hypothetical_trading_monthly_cents INTEGER NOT NULL CHECK(hypothetical_trading_monthly_cents >= 0),
  notes TEXT NOT NULL DEFAULT '',
  confidence TEXT NOT NULL DEFAULT 'confirmed',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE balance_corrections (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL REFERENCES households(id),
  entity_type TEXT NOT NULL CHECK(entity_type IN ('debt','bank')),
  entity_id TEXT NOT NULL,
  name TEXT NOT NULL,
  previous_amount_cents INTEGER,
  next_amount_cents INTEGER,
  date TEXT NOT NULL,
  reason TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  confidence TEXT NOT NULL DEFAULT 'confirmed',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_bank_transfers_from_date ON bank_transfers(from_account_id, date);
CREATE INDEX idx_bank_transfers_to_date ON bank_transfers(to_account_id, date);
CREATE INDEX idx_income_transactions_account_date ON income_transactions(bank_account_id, date);
CREATE INDEX idx_expense_transactions_account_date ON expense_transactions(bank_account_id, date);
CREATE INDEX idx_debt_payments_account_date ON debt_payments(bank_account_id, date);
CREATE INDEX idx_settlement_payments_account_date ON settlement_payments(bank_account_id, date);
CREATE INDEX idx_expense_transactions_category_date ON expense_transactions(category_id, date);
CREATE INDEX idx_balance_corrections_entity ON balance_corrections(entity_type, entity_id, date);
INSERT INTO app_schema_versions (version, applied_at) VALUES (2, strftime('%Y-%m-%dT%H:%M:%fZ','now'));
