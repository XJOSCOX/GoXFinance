CREATE TABLE `expense_category_allocations` (
	`expense_id` text NOT NULL,
	`household_id` text NOT NULL,
	`category_id` text NOT NULL,
	`amount_cents` integer NOT NULL,
	FOREIGN KEY (`expense_id`,`household_id`) REFERENCES `expenses`(`id`,`household_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`category_id`,`household_id`) REFERENCES `expense_categories`(`id`,`household_id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "expense_allocation_amount" CHECK("expense_category_allocations"."amount_cents" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `expense_allocation_unique` ON `expense_category_allocations` (`expense_id`,`category_id`);--> statement-breakpoint
CREATE TABLE `expense_audit` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`expense_id` text NOT NULL,
	`actor_user_id` text NOT NULL,
	`action` text NOT NULL,
	`before_json` text,
	`after_json` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`expense_id`,`household_id`) REFERENCES `expenses`(`id`,`household_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `expense_audit_record` ON `expense_audit` (`household_id`,`expense_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `expense_categories` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`name` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `expense_category_name` ON `expense_categories` (`household_id`,`name`);--> statement-breakpoint
CREATE UNIQUE INDEX `expense_category_scope` ON `expense_categories` (`id`,`household_id`);--> statement-breakpoint
CREATE TABLE `expenses` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`responsible_member_id` text NOT NULL,
	`created_by_user_id` text NOT NULL,
	`description` text NOT NULL,
	`merchant` text,
	`amount_cents` integer NOT NULL,
	`transaction_date` text NOT NULL,
	`payment_method` text NOT NULL,
	`linked_debt_id` text,
	`notes` text,
	`idempotency_key` text NOT NULL,
	`voided` integer DEFAULT false NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`responsible_member_id`,`household_id`) REFERENCES `household_members`(`id`,`household_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`linked_debt_id`,`household_id`) REFERENCES `debts`(`id`,`household_id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "expense_amount" CHECK("expenses"."amount_cents" > 0),
	CONSTRAINT "expense_credit_link" CHECK("expenses"."linked_debt_id" is null or "expenses"."payment_method" = 'credit_card'),
	CONSTRAINT "expense_method" CHECK("expenses"."payment_method" in ('bank_transfer','debit_card','credit_card','cash','check','other'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `expense_scope` ON `expenses` (`id`,`household_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `expense_submission` ON `expenses` (`household_id`,`idempotency_key`);--> statement-breakpoint
CREATE INDEX `expense_household_date` ON `expenses` (`household_id`,`transaction_date`);--> statement-breakpoint
CREATE INDEX `expense_member` ON `expenses` (`household_id`,`responsible_member_id`);