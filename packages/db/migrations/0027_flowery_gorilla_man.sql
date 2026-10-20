CREATE TABLE `forecast_audit` (
	`id` text PRIMARY KEY NOT NULL,
	`scenario_id` text NOT NULL,
	`household_id` text NOT NULL,
	`actor_user_id` text NOT NULL,
	`action` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`scenario_id`) REFERENCES `forecast_scenarios`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `forecast_audit_home` ON `forecast_audit` (`household_id`,`scenario_id`);--> statement-breakpoint
CREATE TABLE `forecast_scenarios` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`created_by_user_id` text NOT NULL,
	`input_json` text NOT NULL,
	`sources_json` text NOT NULL,
	`report_json` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `forecast_submission` ON `forecast_scenarios` (`household_id`,`idempotency_key`);--> statement-breakpoint
CREATE INDEX `forecast_history` ON `forecast_scenarios` (`household_id`,`created_at`);