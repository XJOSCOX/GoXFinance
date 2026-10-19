CREATE TABLE `bill_audit` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`bill_id` text NOT NULL,
	`actor_user_id` text NOT NULL,
	`target_id` text NOT NULL,
	`action` text NOT NULL,
	`before_json` text,
	`after_json` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`bill_id`,`household_id`) REFERENCES `bills`(`id`,`household_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `bill_audit_target` ON `bill_audit` (`household_id`,`bill_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `bill_change_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`bill_id` text NOT NULL,
	`proposed_by_user_id` text NOT NULL,
	`proposal_json` text NOT NULL,
	`original_json` text NOT NULL,
	`base_hash` text NOT NULL,
	`reason` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`active_target` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`reviewed_by_user_id` text,
	`reviewed_at` text,
	`review_note` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`proposed_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`reviewed_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`bill_id`,`household_id`) REFERENCES `bills`(`id`,`household_id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "bill_request_status" CHECK("bill_change_requests"."status" in ('pending','approved','rejected','cancelled')),
	CONSTRAINT "bill_request_review" CHECK(("bill_change_requests"."status"='pending' and "bill_change_requests"."active_target" is not null and "bill_change_requests"."reviewed_by_user_id" is null) or ("bill_change_requests"."status"<>'pending' and "bill_change_requests"."active_target" is null and "bill_change_requests"."reviewed_by_user_id" is not null))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bill_request_key` ON `bill_change_requests` (`household_id`,`proposed_by_user_id`,`idempotency_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `bill_request_pending` ON `bill_change_requests` (`household_id`,`bill_id`,`proposed_by_user_id`,`active_target`);--> statement-breakpoint
CREATE INDEX `bill_request_household_status` ON `bill_change_requests` (`household_id`,`status`);--> statement-breakpoint
CREATE TABLE `bill_members` (
	`bill_id` text NOT NULL,
	`household_id` text NOT NULL,
	`member_id` text NOT NULL,
	FOREIGN KEY (`bill_id`,`household_id`) REFERENCES `bills`(`id`,`household_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`member_id`,`household_id`) REFERENCES `household_members`(`id`,`household_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bill_members_unique` ON `bill_members` (`bill_id`,`member_id`);--> statement-breakpoint
CREATE TABLE `bill_payments` (
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
	`debt_id` text,
	`debt_payment_id` text,
	`confirmed_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`period_id`,`household_id`,`bill_id`) REFERENCES `bill_periods`(`id`,`household_id`,`bill_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`debt_id`,`household_id`) REFERENCES `debts`(`id`,`household_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`debt_payment_id`,`household_id`,`debt_id`) REFERENCES `debt_payments`(`id`,`household_id`,`debt_id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "bill_payment_link" CHECK("bill_payments"."debt_payment_id" is null or "bill_payments"."debt_id" is not null),
	CONSTRAINT "bill_payment_amount" CHECK("bill_payments"."amount_cents">0),
	CONSTRAINT "bill_payment_status" CHECK("bill_payments"."status" in ('pending','completed','cancelled')),
	CONSTRAINT "bill_payment_confirmed" CHECK("bill_payments"."status" <> 'completed' or "bill_payments"."confirmed_at" is not null),
	CONSTRAINT "bill_payment_method" CHECK("bill_payments"."method" in ('bank_transfer','debit_card','credit_card','cash','check','other'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bill_payment_key` ON `bill_payments` (`household_id`,`idempotency_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `bill_payment_debt_link` ON `bill_payments` (`debt_payment_id`);--> statement-breakpoint
CREATE INDEX `bill_payment_period` ON `bill_payments` (`household_id`,`bill_id`,`period_id`);--> statement-breakpoint
CREATE TABLE `bill_periods` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`bill_id` text NOT NULL,
	`due_date` text NOT NULL,
	`name` text NOT NULL,
	`category` text NOT NULL,
	`amount_cents` integer,
	`estimated_amount_cents` integer,
	`linked_debt_id` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`bill_id`,`household_id`) REFERENCES `bills`(`id`,`household_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`linked_debt_id`,`household_id`) REFERENCES `debts`(`id`,`household_id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "bill_period_amount" CHECK(("bill_periods"."amount_cents" is null or "bill_periods"."amount_cents" >= 0) and ("bill_periods"."estimated_amount_cents" is null or "bill_periods"."estimated_amount_cents" >= 0))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bill_period_due` ON `bill_periods` (`household_id`,`bill_id`,`due_date`);--> statement-breakpoint
CREATE UNIQUE INDEX `bill_period_scope` ON `bill_periods` (`id`,`household_id`,`bill_id`);--> statement-breakpoint
CREATE INDEX `bill_period_household_due` ON `bill_periods` (`household_id`,`due_date`);--> statement-breakpoint
CREATE TABLE `bills` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`created_by_user_id` text NOT NULL,
	`name` text NOT NULL,
	`category` text NOT NULL,
	`kind` text NOT NULL,
	`amount_type` text NOT NULL,
	`amount_cents` integer,
	`estimated_amount_cents` integer,
	`frequency` text,
	`next_due_date` text NOT NULL,
	`end_date` text,
	`auto_pay` integer NOT NULL,
	`status` text NOT NULL,
	`notes` text,
	`linked_debt_id` text,
	`revision` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`linked_debt_id`,`household_id`) REFERENCES `debts`(`id`,`household_id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "bill_kind" CHECK("bills"."kind" in ('recurring','one_time')),
	CONSTRAINT "bill_amount_type" CHECK("bills"."amount_type" in ('fixed','variable')),
	CONSTRAINT "bill_amount_nonnegative" CHECK(("bills"."amount_cents" is null or "bills"."amount_cents" >= 0) and ("bills"."estimated_amount_cents" is null or "bills"."estimated_amount_cents" >= 0)),
	CONSTRAINT "bill_schedule" CHECK(("bills"."kind"='recurring' and "bills"."frequency" in ('weekly','biweekly','monthly','quarterly','annually') and "bills"."status" in ('active','inactive')) or ("bills"."kind"='one_time' and "bills"."frequency" is null and "bills"."linked_debt_id" is null and "bills"."end_date" is null and "bills"."status" in ('active','cancelled'))),
	CONSTRAINT "bill_end_date" CHECK("bills"."end_date" is null or "bills"."end_date" >= "bills"."next_due_date")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bills_id_household` ON `bills` (`id`,`household_id`);--> statement-breakpoint
CREATE INDEX `bills_household_status_due` ON `bills` (`household_id`,`status`,`next_due_date`);--> statement-breakpoint
CREATE UNIQUE INDEX `bills_active_debt` ON `bills` (`household_id`,`linked_debt_id`) WHERE "bills"."status" = 'active';