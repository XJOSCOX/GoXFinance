CREATE TABLE `insight_audit` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`actor_user_id` text NOT NULL,
	`target_id` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`digest` text NOT NULL,
	`details_json` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `insight_submission` ON `insight_audit` (`household_id`,`actor_user_id`,`idempotency_key`);--> statement-breakpoint
CREATE INDEX `insight_history` ON `insight_audit` (`household_id`,`target_id`);--> statement-breakpoint
CREATE TABLE `insight_records` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`actor_user_id` text NOT NULL,
	`insight_id` text NOT NULL,
	`kind` text NOT NULL,
	`revision` integer NOT NULL,
	`values_json` text NOT NULL,
	`snapshot_json` text NOT NULL,
	`fingerprint` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `insight_actor_kind` ON `insight_records` (`household_id`,`actor_user_id`,`insight_id`,`kind`);--> statement-breakpoint
CREATE INDEX `insight_home` ON `insight_records` (`household_id`);
--> statement-breakpoint
CREATE TRIGGER insight_audit_no_update BEFORE UPDATE ON insight_audit BEGIN SELECT RAISE(ABORT, 'Insight audit is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER insight_audit_no_delete BEFORE DELETE ON insight_audit BEGIN SELECT RAISE(ABORT, 'Insight audit is immutable'); END;

--> statement-breakpoint
CREATE TRIGGER insight_context_no_update BEFORE UPDATE ON insight_records
WHEN NEW.snapshot_json != OLD.snapshot_json OR NEW.fingerprint != OLD.fingerprint OR NEW.created_at != OLD.created_at OR NEW.actor_user_id != OLD.actor_user_id OR NEW.household_id != OLD.household_id OR NEW.insight_id != OLD.insight_id OR NEW.kind != OLD.kind
BEGIN SELECT RAISE(ABORT, 'Insight context is immutable'); END;
