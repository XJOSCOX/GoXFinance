CREATE TABLE `copy_event_results` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`event_id` text NOT NULL,
	`account_id` text NOT NULL,
	`quantity` text NOT NULL,
	`gross_cents` integer NOT NULL,
	`fees_cents` integer NOT NULL,
	`net_cents` integer NOT NULL,
	`session_date` text NOT NULL,
	`timezone` text NOT NULL,
	`session_start` text NOT NULL,
	FOREIGN KEY (`event_id`,`household_id`) REFERENCES `copy_events`(`id`,`household_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`account_id`,`household_id`) REFERENCES `trading_accounts`(`id`,`household_id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "copy_result_math" CHECK("copy_event_results"."fees_cents" >= 0 and "copy_event_results"."net_cents" = "copy_event_results"."gross_cents" - "copy_event_results"."fees_cents")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `copy_event_account` ON `copy_event_results` (`event_id`,`account_id`);--> statement-breakpoint
CREATE INDEX `copy_result_date` ON `copy_event_results` (`household_id`,`account_id`,`session_date`);--> statement-breakpoint
CREATE TABLE `copy_events` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`created_by_user_id` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`group_id` text NOT NULL,
	`session_at` text NOT NULL,
	`mode` text NOT NULL,
	`instrument` text,
	`direction` text,
	`notes` text,
	`membership_json` text NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`group_id`,`household_id`) REFERENCES `copy_groups`(`id`,`household_id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "copy_event_mode" CHECK("copy_events"."mode" in ('trade','daily'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `copy_event_scope` ON `copy_events` (`id`,`household_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `copy_event_submission` ON `copy_events` (`household_id`,`idempotency_key`);--> statement-breakpoint
CREATE TABLE `copy_group_members` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`group_id` text NOT NULL,
	`account_id` text NOT NULL,
	`quantity_multiplier` text NOT NULL,
	FOREIGN KEY (`group_id`,`household_id`) REFERENCES `copy_groups`(`id`,`household_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`account_id`,`household_id`) REFERENCES `trading_accounts`(`id`,`household_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `copy_group_member` ON `copy_group_members` (`group_id`,`account_id`);--> statement-breakpoint
CREATE TABLE `copy_groups` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`created_by_user_id` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`name` text NOT NULL,
	`lead_account_id` text NOT NULL,
	`status` text NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`lead_account_id`,`household_id`) REFERENCES `trading_accounts`(`id`,`household_id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "copy_group_status" CHECK("copy_groups"."status" in ('active','inactive'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `copy_group_scope` ON `copy_groups` (`id`,`household_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `copy_group_submission` ON `copy_groups` (`household_id`,`idempotency_key`);--> statement-breakpoint
CREATE TABLE `trading_payout_batches` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`created_by_user_id` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`name` text NOT NULL,
	`request_date` text NOT NULL,
	`notes` text,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `payout_batch_submission` ON `trading_payout_batches` (`household_id`,`idempotency_key`);--> statement-breakpoint
ALTER TABLE `trading_payouts` ADD `batch_id` text REFERENCES trading_payout_batches(id);--> statement-breakpoint
ALTER TABLE `financial_goals` ADD `copy_group_id` text REFERENCES copy_groups(id);
--> statement-breakpoint
CREATE TRIGGER goal_copy_group_scope_insert BEFORE INSERT ON financial_goals WHEN NEW.copy_group_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM copy_groups WHERE id=NEW.copy_group_id AND household_id=NEW.household_id) BEGIN SELECT RAISE(ABORT,'Goal group household mismatch'); END;
--> statement-breakpoint
CREATE TRIGGER goal_copy_group_scope_update BEFORE UPDATE OF copy_group_id,household_id ON financial_goals WHEN NEW.copy_group_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM copy_groups WHERE id=NEW.copy_group_id AND household_id=NEW.household_id) BEGIN SELECT RAISE(ABORT,'Goal group household mismatch'); END;
--> statement-breakpoint
CREATE TRIGGER payout_batch_scope_insert BEFORE INSERT ON trading_payouts WHEN NEW.batch_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM trading_payout_batches WHERE id=NEW.batch_id AND household_id=NEW.household_id) BEGIN SELECT RAISE(ABORT,'Payout batch household mismatch'); END;
--> statement-breakpoint
CREATE TRIGGER payout_batch_scope_update BEFORE UPDATE OF batch_id,household_id ON trading_payouts WHEN NEW.batch_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM trading_payout_batches WHERE id=NEW.batch_id AND household_id=NEW.household_id) BEGIN SELECT RAISE(ABORT,'Payout batch household mismatch'); END;
