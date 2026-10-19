CREATE TABLE `households` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`created_by_user_id` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "households_name_length" CHECK(length("households"."name") between 1 and 120)
);
--> statement-breakpoint
CREATE INDEX `households_creator_idx` ON `households` (`created_by_user_id`);--> statement-breakpoint
CREATE TABLE `household_members` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`linked_user_id` text,
	`full_name` text NOT NULL,
	`relationship` text NOT NULL,
	`status` text NOT NULL,
	`notes` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`linked_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "household_members_name_length" CHECK(length("household_members"."full_name") between 1 and 120),
	CONSTRAINT "household_members_relationship_check" CHECK("household_members"."relationship" in ('self','spouse','child','parent','other')),
	CONSTRAINT "household_members_status_check" CHECK("household_members"."status" in ('active','inactive'))
);
--> statement-breakpoint
CREATE INDEX `household_members_household_idx` ON `household_members` (`household_id`);--> statement-breakpoint
CREATE INDEX `household_members_linked_user_idx` ON `household_members` (`linked_user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `household_members_linked_user_unique` ON `household_members` (`household_id`,`linked_user_id`);--> statement-breakpoint
CREATE TABLE `household_user_roles` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "household_user_roles_role_check" CHECK("household_user_roles"."role" in ('owner','admin','editor','viewer'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `household_user_roles_unique` ON `household_user_roles` (`household_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `household_user_roles_user_idx` ON `household_user_roles` (`user_id`);