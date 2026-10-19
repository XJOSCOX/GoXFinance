CREATE TABLE `trading_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`created_by_user_id` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`responsible_member_id` text NOT NULL,
	`provider` text NOT NULL,
	`nickname` text NOT NULL,
	`masked_external_id` text,
	`stage` text NOT NULL,
	`xfa_path` text NOT NULL,
	`tier_cents` integer,
	`reported_balance_cents` integer,
	`maximum_loss_cents` integer,
	`daily_loss_cents` integer,
	`activation_date` text,
	`status` text NOT NULL,
	`timezone` text NOT NULL,
	`session_start` text NOT NULL,
	`notes` text,
	`income_source_id` text,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`responsible_member_id`,`household_id`) REFERENCES `household_members`(`id`,`household_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`income_source_id`,`household_id`) REFERENCES `income_sources`(`id`,`household_id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "trading_provider" CHECK("trading_accounts"."provider" = 'Topstep'),
	CONSTRAINT "trading_stage" CHECK("trading_accounts"."stage" in ('combine','xfa','lfa')),
	CONSTRAINT "trading_path" CHECK("trading_accounts"."xfa_path" in ('standard','consistency','not_applicable') and ("trading_accounts"."stage" = 'xfa' or "trading_accounts"."xfa_path" = 'not_applicable')),
	CONSTRAINT "trading_status" CHECK("trading_accounts"."status" in ('active','passed','failed','closed','paused')),
	CONSTRAINT "trading_limits" CHECK(("trading_accounts"."tier_cents" is null or "trading_accounts"."tier_cents" >= 0) and ("trading_accounts"."maximum_loss_cents" is null or "trading_accounts"."maximum_loss_cents" >= 0) and ("trading_accounts"."daily_loss_cents" is null or "trading_accounts"."daily_loss_cents" >= 0))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `trading_account_scope` ON `trading_accounts` (`id`,`household_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `trading_account_submission` ON `trading_accounts` (`household_id`,`idempotency_key`);--> statement-breakpoint
CREATE INDEX `trading_account_member` ON `trading_accounts` (`household_id`,`responsible_member_id`);--> statement-breakpoint
CREATE TABLE `trading_audit` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`actor_user_id` text NOT NULL,
	`action` text NOT NULL,
	`target_id` text NOT NULL,
	`before_json` text,
	`after_json` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `trading_audit_target` ON `trading_audit` (`household_id`,`target_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `trading_payouts` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`created_by_user_id` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`account_id` text NOT NULL,
	`requested_cents` integer NOT NULL,
	`request_date` text NOT NULL,
	`status` text NOT NULL,
	`approved_cents` integer,
	`received_cents` integer,
	`deposit_date` text,
	`reference` text,
	`notes` text,
	`receipt_confirmed` integer NOT NULL,
	`existing_income_transaction_id` text,
	`income_transaction_id` text,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`account_id`,`household_id`) REFERENCES `trading_accounts`(`id`,`household_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`income_transaction_id`,`household_id`) REFERENCES `income_transactions`(`id`,`household_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`existing_income_transaction_id`,`household_id`) REFERENCES `income_transactions`(`id`,`household_id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "trading_payout_status" CHECK("trading_payouts"."status" in ('requested','approved','rejected','paid','cancelled')),
	CONSTRAINT "trading_payout_money" CHECK("trading_payouts"."requested_cents" > 0 and ("trading_payouts"."approved_cents" is null or "trading_payouts"."approved_cents" >= 0) and ("trading_payouts"."received_cents" is null or "trading_payouts"."received_cents" >= 0)),
	CONSTRAINT "trading_payout_receipt" CHECK(("trading_payouts"."status" = 'paid' and "trading_payouts"."received_cents" is not null and "trading_payouts"."deposit_date" is not null and "trading_payouts"."income_transaction_id" is not null and "trading_payouts"."receipt_confirmed" = 1) or ("trading_payouts"."status" <> 'paid' and "trading_payouts"."received_cents" is null and "trading_payouts"."deposit_date" is null and "trading_payouts"."income_transaction_id" is null and "trading_payouts"."receipt_confirmed" = 0))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `trading_payout_submission` ON `trading_payouts` (`household_id`,`idempotency_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `trading_payout_reference` ON `trading_payouts` (`household_id`,`reference`);--> statement-breakpoint
CREATE UNIQUE INDEX `trading_payout_income` ON `trading_payouts` (`income_transaction_id`);--> statement-breakpoint
CREATE INDEX `trading_payout_date` ON `trading_payouts` (`household_id`,`request_date`);--> statement-breakpoint
CREATE TABLE `trading_results` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`created_by_user_id` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`account_id` text NOT NULL,
	`session_at` text NOT NULL,
	`session_date` text NOT NULL,
	`timezone` text NOT NULL,
	`session_start` text NOT NULL,
	`gross_cents` integer NOT NULL,
	`fees_cents` integer NOT NULL,
	`net_cents` integer NOT NULL,
	`trade_count` integer,
	`notes` text,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`account_id`,`household_id`) REFERENCES `trading_accounts`(`id`,`household_id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "trading_result_math" CHECK("trading_results"."fees_cents" >= 0 and "trading_results"."net_cents" = "trading_results"."gross_cents" - "trading_results"."fees_cents"),
	CONSTRAINT "trading_trade_count" CHECK("trading_results"."trade_count" is null or "trading_results"."trade_count" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `trading_result_submission` ON `trading_results` (`household_id`,`idempotency_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `trading_daily_summary` ON `trading_results` (`account_id`,`session_date`);--> statement-breakpoint
CREATE INDEX `trading_result_date` ON `trading_results` (`household_id`,`session_date`);--> statement-breakpoint
CREATE TABLE `trading_rule_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`account_id` text NOT NULL,
	`rules_json` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`account_id`,`household_id`) REFERENCES `trading_accounts`(`id`,`household_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `trading_rules_account` ON `trading_rule_snapshots` (`household_id`,`account_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `financial_goals` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`created_by_user_id` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`name` text NOT NULL,
	`goal_type` text NOT NULL,
	`target_cents` integer NOT NULL,
	`period` text NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text NOT NULL,
	`responsible_member_id` text,
	`trading_account_id` text,
	`direction` text NOT NULL,
	`status` text NOT NULL,
	`notes` text,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`responsible_member_id`,`household_id`) REFERENCES `household_members`(`id`,`household_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`trading_account_id`,`household_id`) REFERENCES `trading_accounts`(`id`,`household_id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "goal_target" CHECK("financial_goals"."target_cents" >= 0),
	CONSTRAINT "goal_dates" CHECK("financial_goals"."end_date" >= "financial_goals"."start_date"),
	CONSTRAINT "goal_direction" CHECK("financial_goals"."direction" in ('at_least','at_most')),
	CONSTRAINT "goal_status" CHECK("financial_goals"."status" in ('active','paused','completed')),
	CONSTRAINT "goal_type" CHECK("financial_goals"."goal_type" in ('trading_profit','trading_loss','confirmed_income','savings','debt_reduction','spending_limit','bill_completion','manual')),
	CONSTRAINT "goal_period" CHECK("financial_goals"."period" in ('daily','weekly','monthly','quarterly','yearly','custom'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `goal_scope` ON `financial_goals` (`id`,`household_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `goal_submission` ON `financial_goals` (`household_id`,`idempotency_key`);--> statement-breakpoint
CREATE INDEX `goal_member` ON `financial_goals` (`household_id`,`responsible_member_id`);--> statement-breakpoint
CREATE TABLE `goal_audit` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`actor_user_id` text NOT NULL,
	`action` text NOT NULL,
	`target_id` text NOT NULL,
	`before_json` text,
	`after_json` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `goal_audit_target` ON `goal_audit` (`household_id`,`target_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `goal_contributions` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`created_by_user_id` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`goal_id` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`date` text NOT NULL,
	`notes` text NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`goal_id`,`household_id`) REFERENCES `financial_goals`(`id`,`household_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `goal_contribution_submission` ON `goal_contributions` (`household_id`,`idempotency_key`);--> statement-breakpoint
CREATE INDEX `goal_contribution_date` ON `goal_contributions` (`household_id`,`goal_id`,`date`);