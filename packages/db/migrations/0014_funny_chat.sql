CREATE TABLE `income_audit` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`source_id` text NOT NULL,
	`transaction_id` text,
	`actor_user_id` text NOT NULL,
	`action` text NOT NULL,
	`before_json` text,
	`after_json` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`source_id`,`household_id`) REFERENCES `income_sources`(`id`,`household_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`transaction_id`,`household_id`) REFERENCES `income_transactions`(`id`,`household_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `income_audit_source` ON `income_audit` (`household_id`,`source_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `income_audit_transaction` ON `income_audit` (`household_id`,`transaction_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `income_sources` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`responsible_member_id` text NOT NULL,
	`created_by_user_id` text NOT NULL,
	`name` text NOT NULL,
	`income_type` text NOT NULL,
	`frequency` text NOT NULL,
	`hourly_rate_cents` integer,
	`expected_gross_cents` integer,
	`expected_net_cents` integer,
	`payday` integer,
	`overtime_multiplier` text NOT NULL,
	`status` text NOT NULL,
	`notes` text,
	`revision` integer DEFAULT 1 NOT NULL,
	`is_archived` integer DEFAULT false NOT NULL,
	`idempotency_key` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`responsible_member_id`,`household_id`) REFERENCES `household_members`(`id`,`household_id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "income_source_type" CHECK("income_sources"."income_type" in ('hourly','salary','self_employment','military','benefits','trading_payout','other')),
	CONSTRAINT "income_source_frequency" CHECK("income_sources"."frequency" in ('weekly','biweekly','semimonthly','monthly','annually','irregular')),
	CONSTRAINT "income_source_status" CHECK("income_sources"."status" in ('active','inactive')),
	CONSTRAINT "income_source_payday" CHECK("income_sources"."payday" is null or "income_sources"."payday" between 0 and 6),
	CONSTRAINT "income_source_money" CHECK(("income_sources"."hourly_rate_cents" is null or "income_sources"."hourly_rate_cents" >= 0) and ("income_sources"."expected_gross_cents" is null or "income_sources"."expected_gross_cents" >= 0) and ("income_sources"."expected_net_cents" is null or "income_sources"."expected_net_cents" >= 0))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `income_source_scope` ON `income_sources` (`id`,`household_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `income_source_submission` ON `income_sources` (`household_id`,`idempotency_key`);--> statement-breakpoint
CREATE INDEX `income_source_member` ON `income_sources` (`household_id`,`responsible_member_id`);--> statement-breakpoint
CREATE TABLE `income_transactions` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`source_id` text NOT NULL,
	`responsible_member_id` text NOT NULL,
	`created_by_user_id` text NOT NULL,
	`income_type_snapshot` text NOT NULL,
	`frequency_snapshot` text NOT NULL,
	`work_period_start` text,
	`work_period_end` text,
	`regular_hours` text,
	`overtime_hours` text,
	`hourly_rate_cents` integer,
	`overtime_multiplier` text NOT NULL,
	`estimated_gross_cents` integer,
	`expected_gross_cents` integer,
	`expected_net_cents` integer,
	`actual_gross_cents` integer,
	`deductions_cents` integer,
	`actual_net_cents` integer,
	`pay_date` text NOT NULL,
	`deposit_date` text,
	`status` text NOT NULL,
	`reference` text,
	`notes` text,
	`receipt_confirmed` integer NOT NULL,
	`trading_payout_withdrawn` integer NOT NULL,
	`confirmed_at` text,
	`revision` integer DEFAULT 1 NOT NULL,
	`paycheck_key` text NOT NULL,
	`regular_pay_date` text,
	`idempotency_key` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`source_id`,`household_id`) REFERENCES `income_sources`(`id`,`household_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`responsible_member_id`,`household_id`) REFERENCES `household_members`(`id`,`household_id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "income_transaction_status" CHECK("income_transactions"."status" in ('expected','pending','confirmed','cancelled')),
	CONSTRAINT "income_withdrawn_payout" CHECK("income_transactions"."status" <> 'confirmed' or "income_transactions"."income_type_snapshot" <> 'trading_payout' or "income_transactions"."trading_payout_withdrawn" = 1),
	CONSTRAINT "income_confirmation" CHECK("income_transactions"."status" <> 'confirmed' or ("income_transactions"."actual_net_cents" is not null and "income_transactions"."deposit_date" is not null and "income_transactions"."confirmed_at" is not null and "income_transactions"."receipt_confirmed" = 1)),
	CONSTRAINT "income_work_period" CHECK(("income_transactions"."work_period_start" is null and "income_transactions"."work_period_end" is null) or ("income_transactions"."work_period_start" is not null and "income_transactions"."work_period_end" >= "income_transactions"."work_period_start")),
	CONSTRAINT "income_transaction_money" CHECK(("income_transactions"."actual_net_cents" is null or "income_transactions"."actual_net_cents" >= 0) and ("income_transactions"."actual_gross_cents" is null or "income_transactions"."actual_gross_cents" >= 0) and ("income_transactions"."deductions_cents" is null or "income_transactions"."deductions_cents" >= 0) and ("income_transactions"."hourly_rate_cents" is null or "income_transactions"."hourly_rate_cents" >= 0) and ("income_transactions"."expected_net_cents" is null or "income_transactions"."expected_net_cents" >= 0) and ("income_transactions"."expected_gross_cents" is null or "income_transactions"."expected_gross_cents" >= 0) and ("income_transactions"."estimated_gross_cents" is null or "income_transactions"."estimated_gross_cents" >= 0))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `income_transaction_scope` ON `income_transactions` (`id`,`household_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `income_transaction_submission` ON `income_transactions` (`household_id`,`idempotency_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `income_paycheck_unique` ON `income_transactions` (`source_id`,`paycheck_key`) WHERE "income_transactions"."status" <> 'cancelled';--> statement-breakpoint
CREATE UNIQUE INDEX `income_paydate_unique` ON `income_transactions` (`source_id`,`regular_pay_date`) WHERE "income_transactions"."status" <> 'cancelled';--> statement-breakpoint
CREATE UNIQUE INDEX `income_reference_unique` ON `income_transactions` (`source_id`,`reference`) WHERE "income_transactions"."status" <> 'cancelled';--> statement-breakpoint
CREATE INDEX `income_deposit_date` ON `income_transactions` (`household_id`,`deposit_date`);--> statement-breakpoint
CREATE INDEX `income_pay_date` ON `income_transactions` (`household_id`,`pay_date`);