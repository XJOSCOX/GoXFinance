ALTER TABLE `debts` ADD `category_id` text REFERENCES expense_categories(id);--> statement-breakpoint
ALTER TABLE `bill_periods` ADD `category_id` text REFERENCES expense_categories(id);--> statement-breakpoint
ALTER TABLE `bills` ADD `category_id` text REFERENCES expense_categories(id);--> statement-breakpoint
ALTER TABLE `expense_categories` ADD `normalized_name` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `expense_categories` ADD `description` text;--> statement-breakpoint
ALTER TABLE `expense_categories` ADD `icon` text;--> statement-breakpoint
ALTER TABLE `expense_categories` ADD `archived` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `expense_categories` ADD `revision` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `expense_categories` ADD `updated_at` text DEFAULT '' NOT NULL;--> statement-breakpoint
UPDATE expense_categories SET normalized_name = lower(trim(name)), updated_at = created_at;--> statement-breakpoint
CREATE UNIQUE INDEX `financial_category_name` ON `expense_categories` (`household_id`,`normalized_name`);
--> statement-breakpoint
INSERT OR IGNORE INTO expense_categories(id,household_id,name,normalized_name,created_at,updated_at) SELECT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random() % 4)+1,1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))), h.id, d.name, lower(trim(d.name)), h.created_at, h.created_at FROM households h CROSS JOIN (SELECT 'Housing' AS name UNION ALL SELECT 'Utilities' AS name UNION ALL SELECT 'Internet & Phone' AS name UNION ALL SELECT 'Groceries' AS name UNION ALL SELECT 'Dining & Takeout' AS name UNION ALL SELECT 'Transportation' AS name UNION ALL SELECT 'Insurance' AS name UNION ALL SELECT 'Debt Repayment' AS name UNION ALL SELECT 'Healthcare' AS name UNION ALL SELECT 'Children & Family' AS name UNION ALL SELECT 'Shopping' AS name UNION ALL SELECT 'Household Supplies' AS name UNION ALL SELECT 'Subscriptions' AS name UNION ALL SELECT 'Education' AS name UNION ALL SELECT 'Entertainment' AS name UNION ALL SELECT 'Travel' AS name UNION ALL SELECT 'Taxes & Government' AS name UNION ALL SELECT 'Gifts & Donations' AS name UNION ALL SELECT 'Personal Care' AS name UNION ALL SELECT 'Other' AS name) d;
--> statement-breakpoint
INSERT OR IGNORE INTO expense_categories(id,household_id,name,normalized_name,created_at,updated_at) SELECT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random() % 4)+1,1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))), household_id, CASE WHEN trim(category)='' THEN 'Other' ELSE category END, lower(trim(CASE WHEN trim(category)='' THEN 'Other' ELSE category END)), created_at, created_at FROM (SELECT household_id,category,created_at FROM bills UNION SELECT household_id,category,created_at FROM bill_periods);
--> statement-breakpoint
UPDATE bills SET category_id=(SELECT id FROM expense_categories c WHERE c.household_id=bills.household_id AND c.normalized_name=lower(trim(CASE WHEN trim(bills.category)='' THEN 'Other' ELSE bills.category END)));
--> statement-breakpoint
UPDATE bill_periods SET category_id=(SELECT id FROM expense_categories c WHERE c.household_id=bill_periods.household_id AND c.normalized_name=lower(trim(CASE WHEN trim(bill_periods.category)='' THEN 'Other' ELSE bill_periods.category END)));
--> statement-breakpoint
CREATE INDEX bills_category_idx ON bills(household_id,category_id);
--> statement-breakpoint
CREATE TRIGGER bills_category_scope_insert BEFORE INSERT ON bills WHEN NEW.category_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM expense_categories c WHERE c.id=NEW.category_id AND c.household_id=NEW.household_id) BEGIN SELECT RAISE(ABORT,'Category must belong to the same household'); END;
--> statement-breakpoint
CREATE TRIGGER bills_category_scope_update BEFORE UPDATE OF category_id, household_id ON bills WHEN NEW.category_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM expense_categories c WHERE c.id=NEW.category_id AND c.household_id=NEW.household_id) BEGIN SELECT RAISE(ABORT,'Category must belong to the same household'); END;
--> statement-breakpoint
CREATE INDEX bill_periods_category_idx ON bill_periods(household_id,category_id);
--> statement-breakpoint
CREATE TRIGGER bill_periods_category_scope_insert BEFORE INSERT ON bill_periods WHEN NEW.category_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM expense_categories c WHERE c.id=NEW.category_id AND c.household_id=NEW.household_id) BEGIN SELECT RAISE(ABORT,'Category must belong to the same household'); END;
--> statement-breakpoint
CREATE TRIGGER bill_periods_category_scope_update BEFORE UPDATE OF category_id, household_id ON bill_periods WHEN NEW.category_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM expense_categories c WHERE c.id=NEW.category_id AND c.household_id=NEW.household_id) BEGIN SELECT RAISE(ABORT,'Category must belong to the same household'); END;
--> statement-breakpoint
CREATE INDEX debts_category_idx ON debts(household_id,category_id);
--> statement-breakpoint
CREATE TRIGGER debts_category_scope_insert BEFORE INSERT ON debts WHEN NEW.category_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM expense_categories c WHERE c.id=NEW.category_id AND c.household_id=NEW.household_id) BEGIN SELECT RAISE(ABORT,'Category must belong to the same household'); END;
--> statement-breakpoint
CREATE TRIGGER debts_category_scope_update BEFORE UPDATE OF category_id, household_id ON debts WHEN NEW.category_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM expense_categories c WHERE c.id=NEW.category_id AND c.household_id=NEW.household_id) BEGIN SELECT RAISE(ABORT,'Category must belong to the same household'); END;
