-- Rebuild only bill_payments to widen its status CHECK. Copy every existing identifier and link.
CREATE TABLE `__new_bill_payments` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`bill_id` text NOT NULL,
	`period_id` text NOT NULL,
	`created_by_user_id` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`payment_date` text NOT NULL,
	`method` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`notes` text,
	`principal_amount_cents` integer,
	`interest_amount_cents` integer,
	`fees_amount_cents` integer,
	`reference_number` text,
	`debt_id` text,
	`debt_payment_id` text,
	`confirmed_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`period_id`,`household_id`,`bill_id`) REFERENCES `bill_periods`(`id`,`household_id`,`bill_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`debt_id`,`household_id`) REFERENCES `debts`(`id`,`household_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`debt_payment_id`,`household_id`,`debt_id`) REFERENCES `debt_payments`(`id`,`household_id`,`debt_id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "bill_payment_link" CHECK("__new_bill_payments"."debt_payment_id" is null or "__new_bill_payments"."debt_id" is not null),
	CONSTRAINT "bill_payment_amount" CHECK("__new_bill_payments"."amount_cents">0),
	CONSTRAINT "bill_payment_allocation" CHECK(("__new_bill_payments"."principal_amount_cents" is null or "__new_bill_payments"."principal_amount_cents" >= 0) and ("__new_bill_payments"."interest_amount_cents" is null or "__new_bill_payments"."interest_amount_cents" >= 0) and ("__new_bill_payments"."fees_amount_cents" is null or "__new_bill_payments"."fees_amount_cents" >= 0) and coalesce("__new_bill_payments"."principal_amount_cents",0) + coalesce("__new_bill_payments"."interest_amount_cents",0) + coalesce("__new_bill_payments"."fees_amount_cents",0) <= "__new_bill_payments"."amount_cents"),
	CONSTRAINT "bill_payment_status" CHECK("__new_bill_payments"."status" in ('scheduled','pending','completed','failed','cancelled')),
	CONSTRAINT "bill_payment_confirmed" CHECK("__new_bill_payments"."status" <> 'completed' or "__new_bill_payments"."confirmed_at" is not null),
	CONSTRAINT "bill_payment_method" CHECK("__new_bill_payments"."method" in ('bank_transfer','debit_card','credit_card','cash','check','other'))
);
--> statement-breakpoint
INSERT INTO `__new_bill_payments`("id", "household_id", "bill_id", "period_id", "created_by_user_id", "idempotency_key", "amount_cents", "payment_date", "method", "status", "notes", "debt_id", "debt_payment_id", "confirmed_at", "created_at", "updated_at") SELECT "id", "household_id", "bill_id", "period_id", "created_by_user_id", "idempotency_key", "amount_cents", "payment_date", "method", "status", "notes", "debt_id", "debt_payment_id", "confirmed_at", "created_at", "updated_at" FROM `bill_payments`;--> statement-breakpoint
DROP TABLE `bill_payments`;--> statement-breakpoint
ALTER TABLE `__new_bill_payments` RENAME TO `bill_payments`;--> statement-breakpoint
CREATE UNIQUE INDEX `bill_payment_key` ON `bill_payments` (`household_id`,`idempotency_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `bill_payment_debt_link` ON `bill_payments` (`debt_payment_id`);--> statement-breakpoint
CREATE INDEX `bill_payment_period` ON `bill_payments` (`household_id`,`bill_id`,`period_id`);