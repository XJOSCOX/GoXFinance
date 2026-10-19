CREATE TABLE `debt_payment_audit` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`debt_id` text NOT NULL,
	`payment_id` text NOT NULL,
	`actor_user_id` text NOT NULL,
	`action` text NOT NULL,
	`before_json` text,
	`after_json` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`payment_id`,`household_id`,`debt_id`) REFERENCES `debt_payments`(`id`,`household_id`,`debt_id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "debt_payment_audit_action" CHECK("debt_payment_audit"."action" in ('created','edited','cancelled','confirmed'))
);
--> statement-breakpoint
CREATE INDEX `debt_payment_audit_payment_idx` ON `debt_payment_audit` (`payment_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `debt_payments` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`debt_id` text NOT NULL,
	`created_by_user_id` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`payment_date` text NOT NULL,
	`payment_status` text NOT NULL,
	`payment_method` text NOT NULL,
	`principal_amount_cents` integer,
	`interest_amount_cents` integer,
	`fees_amount_cents` integer,
	`reference_number` text,
	`notes` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`debt_id`,`household_id`) REFERENCES `debts`(`id`,`household_id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "debt_payments_amount_positive" CHECK("debt_payments"."amount_cents" > 0),
	CONSTRAINT "debt_payments_principal_nonnegative" CHECK("debt_payments"."principal_amount_cents" is null or "debt_payments"."principal_amount_cents" >= 0),
	CONSTRAINT "debt_payments_interest_nonnegative" CHECK("debt_payments"."interest_amount_cents" is null or "debt_payments"."interest_amount_cents" >= 0),
	CONSTRAINT "debt_payments_fees_nonnegative" CHECK("debt_payments"."fees_amount_cents" is null or "debt_payments"."fees_amount_cents" >= 0),
	CONSTRAINT "debt_payments_allocation" CHECK(coalesce("debt_payments"."principal_amount_cents",0) + coalesce("debt_payments"."interest_amount_cents",0) + coalesce("debt_payments"."fees_amount_cents",0) <= "debt_payments"."amount_cents"),
	CONSTRAINT "debt_payments_status" CHECK("debt_payments"."payment_status" in ('scheduled','pending','completed','failed','cancelled')),
	CONSTRAINT "debt_payments_method" CHECK("debt_payments"."payment_method" in ('bank_transfer','debit_card','credit_card','cash','check','other'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `debt_payments_id_household_debt_unique` ON `debt_payments` (`id`,`household_id`,`debt_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `debt_payments_idempotency_unique` ON `debt_payments` (`household_id`,`debt_id`,`idempotency_key`);--> statement-breakpoint
CREATE INDEX `debt_payments_debt_date_idx` ON `debt_payments` (`household_id`,`debt_id`,`payment_date`);--> statement-breakpoint
CREATE TABLE `debt_balance_history` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`debt_id` text NOT NULL,
	`balance_cents` integer NOT NULL,
	`effective_date` text NOT NULL,
	`source` text NOT NULL,
	`recorded_by_user_id` text NOT NULL,
	`notes` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`recorded_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`debt_id`,`household_id`) REFERENCES `debts`(`id`,`household_id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "debt_balance_history_balance" CHECK("debt_balance_history"."balance_cents" >= 0),
	CONSTRAINT "debt_balance_history_source" CHECK("debt_balance_history"."source" in ('initial','creditor_statement','manual_adjustment','reconciliation'))
);
--> statement-breakpoint
CREATE INDEX `debt_balance_history_date_idx` ON `debt_balance_history` (`household_id`,`debt_id`,`effective_date`);