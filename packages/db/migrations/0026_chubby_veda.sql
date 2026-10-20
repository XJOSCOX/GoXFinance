CREATE TABLE `debt_payoff_scenarios` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`created_by_user_id` text NOT NULL,
	`input_json` text NOT NULL,
	`debt_snapshot_json` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `payoff_submission` ON `debt_payoff_scenarios` (`household_id`,`idempotency_key`);--> statement-breakpoint
CREATE INDEX `payoff_history` ON `debt_payoff_scenarios` (`household_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `debt_planning_audit` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`actor_user_id` text NOT NULL,
	`target_id` text NOT NULL,
	`action` text NOT NULL,
	`before_json` text,
	`after_json` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `planning_audit_target` ON `debt_planning_audit` (`household_id`,`target_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `settlement_installments` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`offer_id` text NOT NULL,
	`debt_id` text NOT NULL,
	`due_date` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`payment_id` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`offer_id`,`household_id`,`debt_id`) REFERENCES `settlement_offers`(`id`,`household_id`,`debt_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`payment_id`,`household_id`,`debt_id`) REFERENCES `debt_payments`(`id`,`household_id`,`debt_id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "settlement_amount" CHECK("settlement_installments"."amount_cents" >= 0 and "settlement_installments"."amount_cents" <= 9007199254740991 and cast("settlement_installments"."amount_cents" as integer) = "settlement_installments"."amount_cents")
);
--> statement-breakpoint
CREATE INDEX `settlement_schedule` ON `settlement_installments` (`household_id`,`offer_id`,`due_date`);--> statement-breakpoint
CREATE UNIQUE INDEX `settlement_payment_once` ON `settlement_installments` (`payment_id`);--> statement-breakpoint
CREATE TABLE `settlement_offers` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`debt_id` text NOT NULL,
	`values_json` text NOT NULL,
	`revision` integer NOT NULL,
	`idempotency_key` text NOT NULL,
	`created_by_user_id` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`debt_id`,`household_id`) REFERENCES `debts`(`id`,`household_id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "settlement_revision" CHECK("settlement_offers"."revision" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `settlement_offer_home` ON `settlement_offers` (`id`,`household_id`,`debt_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `settlement_submission` ON `settlement_offers` (`household_id`,`idempotency_key`);--> statement-breakpoint
CREATE INDEX `settlement_debt` ON `settlement_offers` (`household_id`,`debt_id`);