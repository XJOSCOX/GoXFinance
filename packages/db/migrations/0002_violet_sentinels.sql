CREATE TABLE `household_invitations` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`member_id` text NOT NULL,
	`active_member_id` text,
	`code_hash` text NOT NULL,
	`role` text NOT NULL,
	`status` text NOT NULL,
	`created_by_user_id` text NOT NULL,
	`redeemed_by_user_id` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`expires_at` text NOT NULL,
	`redeemed_at` text,
	`revoked_at` text,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`redeemed_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`member_id`,`household_id`) REFERENCES `household_members`(`id`,`household_id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "household_invitations_role_check" CHECK("household_invitations"."role" in ('admin','editor','viewer')),
	CONSTRAINT "household_invitations_status_check" CHECK("household_invitations"."status" in ('pending','redeemed','revoked','expired')),
	CONSTRAINT "household_invitations_active_check" CHECK(("household_invitations"."status" = 'pending' and "household_invitations"."active_member_id" is not null and "household_invitations"."active_member_id" = "household_invitations"."member_id") or ("household_invitations"."status" <> 'pending' and "household_invitations"."active_member_id" is null))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `household_invitations_code_unique` ON `household_invitations` (`code_hash`);--> statement-breakpoint
CREATE UNIQUE INDEX `household_invitations_active_member_unique` ON `household_invitations` (`active_member_id`);--> statement-breakpoint
CREATE INDEX `household_invitations_household_member_idx` ON `household_invitations` (`household_id`,`member_id`);--> statement-breakpoint
CREATE INDEX `household_invitations_status_expiry_idx` ON `household_invitations` (`status`,`expires_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `household_members_id_household_unique` ON `household_members` (`id`,`household_id`);
