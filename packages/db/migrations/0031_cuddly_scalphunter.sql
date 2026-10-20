CREATE TABLE `payroll_audit` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`source_id` text NOT NULL,
	`created_at` text NOT NULL,
	`week_id` text,
	`actor_user_id` text NOT NULL,
	`action` text NOT NULL,
	`before_json` text,
	`after_json` text NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`source_id`,`household_id`) REFERENCES `income_sources`(`id`,`household_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`week_id`,`household_id`) REFERENCES `payroll_weeks`(`id`,`household_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `payroll_audit_source` ON `payroll_audit` (`household_id`,`source_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `payroll_forecasts` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`source_id` text NOT NULL,
	`created_at` text NOT NULL,
	`week_id` text NOT NULL,
	`model_version` integer NOT NULL,
	`hours_revision` integer NOT NULL,
	`result_json` text NOT NULL,
	`eligible_for_accuracy` integer NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`week_id`,`household_id`) REFERENCES `payroll_weeks`(`id`,`household_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`source_id`,`household_id`) REFERENCES `income_sources`(`id`,`household_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `payroll_forecast_week` ON `payroll_forecasts` (`household_id`,`week_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `payroll_lines` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`statement_id` text NOT NULL,
	`position` integer NOT NULL,
	`label` text NOT NULL,
	`side` text NOT NULL,
	`code` text NOT NULL,
	`treatment` text NOT NULL,
	`current_cents` integer,
	`ytd_cents` integer,
	`rate_cents` integer,
	`hours_hundredths` integer,
	`worked` integer,
	`confidence` text NOT NULL,
	FOREIGN KEY (`statement_id`,`household_id`) REFERENCES `payroll_statements`(`id`,`household_id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "payroll_line_side" CHECK("payroll_lines"."side" in ('earnings','deduction','employer_tax','informational')),
	CONSTRAINT "payroll_line_money" CHECK(("payroll_lines"."current_cents" is null or (abs("payroll_lines"."current_cents")<=9007199254740991 and cast("payroll_lines"."current_cents" as integer)="payroll_lines"."current_cents")) and ("payroll_lines"."ytd_cents" is null or (abs("payroll_lines"."ytd_cents")<=9007199254740991 and cast("payroll_lines"."ytd_cents" as integer)="payroll_lines"."ytd_cents")))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `payroll_line_order` ON `payroll_lines` (`statement_id`,`position`);--> statement-breakpoint
CREATE TABLE `payroll_models` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`source_id` text NOT NULL,
	`created_at` text NOT NULL,
	`version` integer NOT NULL,
	`observations_json` text NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`source_id`,`household_id`) REFERENCES `income_sources`(`id`,`household_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `payroll_model_version` ON `payroll_models` (`household_id`,`source_id`,`version`);--> statement-breakpoint
CREATE TABLE `payroll_profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`source_id` text NOT NULL,
	`created_at` text NOT NULL,
	`values_json` text NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`source_id`,`household_id`) REFERENCES `income_sources`(`id`,`household_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `payroll_profile_source` ON `payroll_profiles` (`household_id`,`source_id`);--> statement-breakpoint
CREATE TABLE `payroll_statements` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`source_id` text NOT NULL,
	`created_at` text NOT NULL,
	`week_id` text NOT NULL,
	`header_json` text NOT NULL,
	`document_digest` text,
	`gross_cents` integer NOT NULL,
	`deductions_cents` integer NOT NULL,
	`net_cents` integer NOT NULL,
	`reviewed_by_user_id` text NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`reviewed_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`week_id`,`household_id`) REFERENCES `payroll_weeks`(`id`,`household_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`source_id`,`household_id`) REFERENCES `income_sources`(`id`,`household_id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "payroll_statement_money" CHECK("payroll_statements"."gross_cents">=0 and "payroll_statements"."deductions_cents">=0 and "payroll_statements"."net_cents">=0 and "payroll_statements"."gross_cents"<=9007199254740991 and "payroll_statements"."deductions_cents"<=9007199254740991 and "payroll_statements"."net_cents"<=9007199254740991)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `payroll_statement_scope` ON `payroll_statements` (`id`,`household_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `payroll_document_unique` ON `payroll_statements` (`household_id`,`document_digest`);--> statement-breakpoint
CREATE TABLE `payroll_weeks` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`source_id` text NOT NULL,
	`created_at` text NOT NULL,
	`workweek_start` text NOT NULL,
	`workweek_end` text NOT NULL,
	`hours_json` text NOT NULL,
	`profile_snapshot_json` text NOT NULL,
	`stage` text NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`income_transaction_id` text,
	`statement_id` text,
	`statement_received_at` text,
	`reviewed_at` text,
	`updated_at` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`created_by_user_id` text NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`source_id`,`household_id`) REFERENCES `income_sources`(`id`,`household_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`income_transaction_id`,`household_id`) REFERENCES `income_transactions`(`id`,`household_id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "payroll_stage" CHECK("payroll_weeks"."stage" in ('hours_draft','hours_submitted','payroll_pending','paystub_received','paystub_reviewed','deposit_confirmed'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `payroll_week_scope` ON `payroll_weeks` (`id`,`household_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `payroll_week_period` ON `payroll_weeks` (`household_id`,`source_id`,`workweek_start`);--> statement-breakpoint
CREATE UNIQUE INDEX `payroll_week_submission` ON `payroll_weeks` (`household_id`,`idempotency_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `payroll_week_income` ON `payroll_weeks` (`income_transaction_id`);