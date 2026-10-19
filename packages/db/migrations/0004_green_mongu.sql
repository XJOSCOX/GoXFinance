CREATE TABLE `household_member_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`proposed_by_user_id` text NOT NULL,
	`full_name` text NOT NULL,
	`relationship` text NOT NULL,
	`notes` text,
	`status` text NOT NULL,
	`reviewed_by_user_id` text,
	`reviewed_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`proposed_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`reviewed_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "member_requests_status_check" CHECK("household_member_requests"."status" in ('pending','approved','rejected','cancelled')),
	CONSTRAINT "member_requests_name_length" CHECK(length("household_member_requests"."full_name") between 1 and 120)
);
--> statement-breakpoint
CREATE INDEX `member_requests_household_status_idx` ON `household_member_requests` (`household_id`,`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `member_requests_pending_unique` ON `household_member_requests` (`household_id`,`proposed_by_user_id`,`full_name`,`relationship`) WHERE "household_member_requests"."status" = 'pending';--> statement-breakpoint
CREATE TABLE `household_audit` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`target_member_id` text,
	`target_request_id` text,
	`actor_user_id` text NOT NULL,
	`action` text NOT NULL,
	`previous_role` text,
	`new_role` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`target_member_id`) REFERENCES `household_members`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`target_request_id`) REFERENCES `household_member_requests`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "household_audit_action_check" CHECK("household_audit"."action" in ('role_changed','planned_role_changed','request_submitted','request_approved','request_rejected','request_cancelled'))
);
--> statement-breakpoint
CREATE INDEX `household_audit_household_time_idx` ON `household_audit` (`household_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `household_audit_member_idx` ON `household_audit` (`target_member_id`);--> statement-breakpoint
CREATE INDEX `household_audit_request_idx` ON `household_audit` (`target_request_id`);--> statement-breakpoint
ALTER TABLE `household_members` ADD COLUMN `planned_access_role` text NOT NULL DEFAULT 'viewer' CHECK (`planned_access_role` IN ('admin','editor','viewer'));--> statement-breakpoint
UPDATE `household_members` SET `planned_access_role` = COALESCE(
  (SELECT `role` FROM `household_invitations` WHERE `member_id` = `household_members`.`id` AND `status` = 'pending' ORDER BY `created_at` DESC LIMIT 1),
  (SELECT `role` FROM `household_user_roles` WHERE `household_id` = `household_members`.`household_id` AND `user_id` = `household_members`.`linked_user_id` AND `role` <> 'owner' LIMIT 1),
  'viewer'
);--> statement-breakpoint
CREATE UNIQUE INDEX `household_single_owner_idx` ON `household_user_roles` (`household_id`) WHERE `role` = 'owner';--> statement-breakpoint
CREATE TRIGGER `household_owner_role_insert` BEFORE INSERT ON `household_user_roles` WHEN (NEW.`role` = 'owner' AND NEW.`user_id` <> (SELECT `created_by_user_id` FROM `households` WHERE `id` = NEW.`household_id`)) OR (NEW.`user_id` = (SELECT `created_by_user_id` FROM `households` WHERE `id` = NEW.`household_id`) AND NEW.`role` <> 'owner') BEGIN SELECT RAISE(ABORT, 'Protected household owner'); END;--> statement-breakpoint
CREATE TRIGGER `household_owner_role_update` BEFORE UPDATE ON `household_user_roles` WHEN OLD.`role` = 'owner' OR NEW.`role` = 'owner' BEGIN SELECT RAISE(ABORT, 'Protected household owner'); END;--> statement-breakpoint
CREATE TRIGGER `household_owner_role_delete` BEFORE DELETE ON `household_user_roles` WHEN OLD.`role` = 'owner' BEGIN SELECT RAISE(ABORT, 'Protected household owner'); END;--> statement-breakpoint
CREATE TRIGGER `household_owner_member_update` BEFORE UPDATE ON `household_members` WHEN OLD.`linked_user_id` = (SELECT `created_by_user_id` FROM `households` WHERE `id` = OLD.`household_id`) BEGIN SELECT RAISE(ABORT, 'Protected household owner'); END;--> statement-breakpoint
CREATE TRIGGER `household_owner_member_delete` BEFORE DELETE ON `household_members` WHEN OLD.`linked_user_id` = (SELECT `created_by_user_id` FROM `households` WHERE `id` = OLD.`household_id`) BEGIN SELECT RAISE(ABORT, 'Protected household owner'); END;
--> statement-breakpoint
CREATE TRIGGER `household_owner_creator_update` BEFORE UPDATE OF `created_by_user_id` ON `households` BEGIN SELECT RAISE(ABORT, 'Protected household creator'); END;
--> statement-breakpoint
CREATE TRIGGER `household_delete_block` BEFORE DELETE ON `households` BEGIN SELECT RAISE(ABORT, 'Household deletion is disabled'); END;
