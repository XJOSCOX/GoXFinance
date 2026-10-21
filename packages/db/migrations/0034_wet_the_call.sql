CREATE TABLE `planner_audit` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`actor_user_id` text NOT NULL,
	`target_id` text NOT NULL,
	`action` text NOT NULL,
	`details_json` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`digest` text NOT NULL,
	`result_json` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `planner_submission` ON `planner_audit` (`household_id`,`idempotency_key`);--> statement-breakpoint
CREATE INDEX `planner_audit_home` ON `planner_audit` (`household_id`,`target_id`);--> statement-breakpoint
CREATE TABLE `planner_records` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`created_by_user_id` text NOT NULL,
	`revision` integer NOT NULL,
	`values_json` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `planner_record_home` ON `planner_records` (`household_id`);--> statement-breakpoint
CREATE TABLE `planner_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`actor_user_id` text NOT NULL,
	`target_id` text,
	`revision` integer NOT NULL,
	`values_json` text NOT NULL,
	`fingerprint` text NOT NULL,
	`reason` text NOT NULL,
	`status` text NOT NULL,
	`reviewed_by_user_id` text,
	`reviewed_at` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`reviewed_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `planner_request_home` ON `planner_requests` (`household_id`);--> statement-breakpoint
CREATE TABLE `planner_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`actor_user_id` text NOT NULL,
	`name` text NOT NULL,
	`input_json` text NOT NULL,
	`sources_json` text NOT NULL,
	`report_json` text NOT NULL,
	`fingerprint` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `planner_snapshot_home` ON `planner_snapshots` (`household_id`);
--> statement-breakpoint
CREATE TRIGGER planner_audit_update_guard BEFORE UPDATE ON planner_audit BEGIN SELECT RAISE(ABORT, 'Planning history is immutable'); END;

--> statement-breakpoint
CREATE TRIGGER planner_audit_delete_guard BEFORE DELETE ON planner_audit BEGIN SELECT RAISE(ABORT, 'Planning history is immutable'); END;

--> statement-breakpoint
CREATE TRIGGER planner_snapshots_update_guard BEFORE UPDATE ON planner_snapshots BEGIN SELECT RAISE(ABORT, 'Planning history is immutable'); END;

--> statement-breakpoint
CREATE TRIGGER planner_snapshots_delete_guard BEFORE DELETE ON planner_snapshots BEGIN SELECT RAISE(ABORT, 'Planning history is immutable'); END;

--> statement-breakpoint
CREATE TRIGGER planner_request_transition_guard BEFORE UPDATE ON planner_requests WHEN OLD.status != 'pending' OR NEW.status NOT IN ('approved','rejected','cancelled') OR OLD.household_id != NEW.household_id OR OLD.actor_user_id != NEW.actor_user_id OR OLD.values_json != NEW.values_json OR OLD.fingerprint != NEW.fingerprint BEGIN SELECT RAISE(ABORT, 'Invalid immutable request transition'); END;
