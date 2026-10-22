CREATE TABLE `command_preferences` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`actor_user_id` text NOT NULL,
	`revision` integer NOT NULL,
	`values_json` text NOT NULL,
	`created_at` text NOT NULL,
	`idempotency_key` text NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `command_pref_version` ON `command_preferences` (`household_id`,`actor_user_id`,`revision`);--> statement-breakpoint
CREATE UNIQUE INDEX `command_pref_submission` ON `command_preferences` (`household_id`,`actor_user_id`,`idempotency_key`);
--> statement-breakpoint
CREATE TRIGGER command_preferences_no_update BEFORE UPDATE ON command_preferences BEGIN SELECT RAISE(ABORT, 'Display preference history is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER command_preferences_no_delete BEFORE DELETE ON command_preferences BEGIN SELECT RAISE(ABORT, 'Display preference history is immutable'); END;
