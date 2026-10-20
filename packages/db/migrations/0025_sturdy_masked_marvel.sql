CREATE TABLE `budget_audit` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`actor_user_id` text NOT NULL,
	`target_id` text NOT NULL,
	`action` text NOT NULL,
	`before_json` text,
	`after_json` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `budget_audit_target` ON `budget_audit` (`household_id`,`target_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `budget_category_limits` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`budget_id` text NOT NULL,
	`category_id` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`budget_id`,`household_id`) REFERENCES `budget_months`(`id`,`household_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`category_id`,`household_id`) REFERENCES `expense_categories`(`id`,`household_id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "budget_limit_amount" CHECK("budget_category_limits"."amount_cents" >= 0 and "budget_category_limits"."amount_cents" <= 9007199254740991 and cast("budget_category_limits"."amount_cents" as integer) = "budget_category_limits"."amount_cents")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `budget_limit_category` ON `budget_category_limits` (`budget_id`,`category_id`);--> statement-breakpoint
CREATE INDEX `budget_limit_home` ON `budget_category_limits` (`household_id`,`budget_id`);--> statement-breakpoint
CREATE TABLE `budget_months` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`responsible_member_id` text,
	`scope_key` text NOT NULL,
	`month` text NOT NULL,
	`total_cents` integer NOT NULL,
	`status` text NOT NULL,
	`notes` text,
	`revision` integer DEFAULT 1 NOT NULL,
	`created_by_user_id` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`responsible_member_id`,`household_id`) REFERENCES `household_members`(`id`,`household_id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "budget_scope_valid" CHECK(("budget_months"."responsible_member_id" is null and "budget_months"."scope_key" = 'household') or ("budget_months"."responsible_member_id" is not null and "budget_months"."scope_key" = "budget_months"."responsible_member_id")),
	CONSTRAINT "budget_amount_valid" CHECK("budget_months"."total_cents" >= 0 and "budget_months"."total_cents" <= 9007199254740991 and cast("budget_months"."total_cents" as integer) = "budget_months"."total_cents"),
	CONSTRAINT "budget_status_valid" CHECK("budget_months"."status" in ('active','archived'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `budget_scope_month` ON `budget_months` (`household_id`,`month`,`scope_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `budget_id_home` ON `budget_months` (`id`,`household_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `budget_submission` ON `budget_months` (`household_id`,`idempotency_key`);--> statement-breakpoint
CREATE INDEX `budget_month_status` ON `budget_months` (`household_id`,`month`,`status`);