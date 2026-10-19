-- SQLite cannot widen CHECK constraints in place. Preserve requests AND their audit
-- children inside the migrator transaction, with foreign keys enabled throughout.
CREATE TABLE __saved_debt_change_audit AS SELECT * FROM debt_change_audit;
--> statement-breakpoint
DROP TABLE debt_change_audit;
--> statement-breakpoint
CREATE TABLE `__new_debt_change_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`debt_id` text NOT NULL,
	`payment_id` text,
	`proposed_by_user_id` text NOT NULL,
	`action` text NOT NULL,
	`payload_json` text NOT NULL,
	`original_json` text NOT NULL,
	`base_hash` text NOT NULL,
	`reason` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`active_target` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`reviewed_by_user_id` text,
	`reviewed_at` text,
	`review_note` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`proposed_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`reviewed_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`debt_id`,`household_id`) REFERENCES `debts`(`id`,`household_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`payment_id`,`household_id`,`debt_id`) REFERENCES `debt_payments`(`id`,`household_id`,`debt_id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "debt_change_status" CHECK("__new_debt_change_requests"."status" in ('pending','approved','rejected','cancelled')),
	CONSTRAINT "debt_change_action" CHECK("__new_debt_change_requests"."action" in ('edit_payment','cancel_payment','confirm_payment','verify_balance','edit_account','archive_account','restore_account')),
	CONSTRAINT "debt_change_target" CHECK(("__new_debt_change_requests"."action" in ('verify_balance','edit_account','archive_account','restore_account') and "__new_debt_change_requests"."payment_id" is null) or ("__new_debt_change_requests"."action" in ('edit_payment','cancel_payment','confirm_payment') and "__new_debt_change_requests"."payment_id" is not null)),
	CONSTRAINT "debt_change_review" CHECK(("__new_debt_change_requests"."status" = 'pending' and "__new_debt_change_requests"."active_target" is not null and "__new_debt_change_requests"."reviewed_by_user_id" is null) or ("__new_debt_change_requests"."status" <> 'pending' and "__new_debt_change_requests"."active_target" is null and "__new_debt_change_requests"."reviewed_by_user_id" is not null))
);
--> statement-breakpoint
INSERT INTO `__new_debt_change_requests`("id", "household_id", "debt_id", "payment_id", "proposed_by_user_id", "action", "payload_json", "original_json", "base_hash", "reason", "idempotency_key", "active_target", "status", "reviewed_by_user_id", "reviewed_at", "review_note", "created_at", "updated_at") SELECT "id", "household_id", "debt_id", "payment_id", "proposed_by_user_id", "action", "payload_json", "original_json", "base_hash", "reason", "idempotency_key", "active_target", "status", "reviewed_by_user_id", "reviewed_at", "review_note", "created_at", "updated_at" FROM `debt_change_requests`;--> statement-breakpoint
DROP TABLE `debt_change_requests`;--> statement-breakpoint
ALTER TABLE `__new_debt_change_requests` RENAME TO `debt_change_requests`;--> statement-breakpoint
CREATE TABLE `debt_change_audit` (
	`id` text PRIMARY KEY NOT NULL,
	`request_id` text NOT NULL,
	`actor_user_id` text NOT NULL,
	`action` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`request_id`) REFERENCES `debt_change_requests`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "debt_change_audit_action" CHECK("debt_change_audit"."action" in ('submitted','approved','rejected','cancelled'))
);
--> statement-breakpoint
CREATE INDEX `debt_change_audit_request` ON `debt_change_audit` (`request_id`,`created_at`);--> statement-breakpoint
INSERT INTO debt_change_audit SELECT * FROM __saved_debt_change_audit;
--> statement-breakpoint
DROP TABLE __saved_debt_change_audit;
--> statement-breakpoint
CREATE UNIQUE INDEX `debt_change_request_key` ON `debt_change_requests` (`household_id`,`proposed_by_user_id`,`idempotency_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `debt_change_pending_target` ON `debt_change_requests` (`household_id`,`debt_id`,`proposed_by_user_id`,`active_target`);--> statement-breakpoint
CREATE INDEX `debt_change_household_status` ON `debt_change_requests` (`household_id`,`status`);