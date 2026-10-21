CREATE TABLE `forecast_settings_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`actor_user_id` text NOT NULL,
	`revision` integer NOT NULL,
	`values_json` text NOT NULL,
	`reason` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `forecast_settings_revision` ON `forecast_settings_versions` (`household_id`,`revision`);--> statement-breakpoint
CREATE UNIQUE INDEX `forecast_settings_submission` ON `forecast_settings_versions` (`household_id`,`idempotency_key`);--> statement-breakpoint
CREATE INDEX `forecast_settings_home` ON `forecast_settings_versions` (`household_id`,`created_at`);
--> statement-breakpoint
CREATE TRIGGER forecast_settings_immutable_update BEFORE UPDATE ON forecast_settings_versions BEGIN SELECT RAISE(ABORT, 'Cash confirmations are immutable; append a new version'); END;
--> statement-breakpoint
CREATE TRIGGER forecast_settings_immutable_delete BEFORE DELETE ON forecast_settings_versions BEGIN SELECT RAISE(ABORT, 'Cash confirmations are immutable'); END;
