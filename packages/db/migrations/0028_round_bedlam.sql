CREATE TABLE `asset_audit` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`asset_id` text NOT NULL,
	`actor_user_id` text NOT NULL,
	`action` text NOT NULL,
	`before_json` text,
	`after_json` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`asset_id`,`household_id`) REFERENCES `assets`(`id`,`household_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `asset_audit_target` ON `asset_audit` (`household_id`,`asset_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `asset_debt_links` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`asset_id` text NOT NULL,
	`debt_id` text NOT NULL,
	FOREIGN KEY (`asset_id`,`household_id`) REFERENCES `assets`(`id`,`household_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`debt_id`,`household_id`) REFERENCES `debts`(`id`,`household_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `asset_debt_once` ON `asset_debt_links` (`asset_id`,`debt_id`);--> statement-breakpoint
CREATE TABLE `asset_members` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`asset_id` text NOT NULL,
	`member_id` text NOT NULL,
	FOREIGN KEY (`asset_id`,`household_id`) REFERENCES `assets`(`id`,`household_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`member_id`,`household_id`) REFERENCES `household_members`(`id`,`household_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `asset_member_once` ON `asset_members` (`asset_id`,`member_id`);--> statement-breakpoint
CREATE TABLE `asset_valuations` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`asset_id` text NOT NULL,
	`value_cents` integer,
	`valuation_date` text NOT NULL,
	`source` text NOT NULL,
	`confidence` text NOT NULL,
	`notes` text,
	`supersedes_id` text,
	`idempotency_key` text NOT NULL,
	`recorded_by_user_id` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`recorded_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`asset_id`,`household_id`) REFERENCES `assets`(`id`,`household_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`supersedes_id`,`asset_id`,`household_id`) REFERENCES `asset_valuations`(`id`,`asset_id`,`household_id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "valuation_cents" CHECK("asset_valuations"."value_cents" is null or ("asset_valuations"."value_cents" between -9007199254740991 and 9007199254740991 and cast("asset_valuations"."value_cents" as integer)="asset_valuations"."value_cents"))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `valuation_submission` ON `asset_valuations` (`household_id`,`idempotency_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `valuation_asset_home` ON `asset_valuations` (`id`,`asset_id`,`household_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `valuation_supersedes_once` ON `asset_valuations` (`supersedes_id`);--> statement-breakpoint
CREATE INDEX `valuation_date` ON `asset_valuations` (`household_id`,`asset_id`,`valuation_date`);--> statement-breakpoint
CREATE TABLE `assets` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`name` text NOT NULL,
	`category` text NOT NULL,
	`acquisition_date` text,
	`purchase_cents` integer,
	`notes` text,
	`status` text NOT NULL,
	`revision` integer NOT NULL,
	`created_by_user_id` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "asset_purchase_cents" CHECK("assets"."purchase_cents" is null or ("assets"."purchase_cents" >= 0 and "assets"."purchase_cents" <= 9007199254740991 and cast("assets"."purchase_cents" as integer)="assets"."purchase_cents")),
	CONSTRAINT "asset_status" CHECK("assets"."status" in ('active','archived'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `asset_home_id` ON `assets` (`id`,`household_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `asset_submission` ON `assets` (`household_id`,`idempotency_key`);--> statement-breakpoint
CREATE INDEX `asset_status_home` ON `assets` (`household_id`,`status`);--> statement-breakpoint
CREATE TABLE `net_worth_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`created_by_user_id` text NOT NULL,
	`report_json` text NOT NULL,
	`sources_json` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `net_worth_submission` ON `net_worth_snapshots` (`household_id`,`idempotency_key`);--> statement-breakpoint
CREATE INDEX `net_worth_history` ON `net_worth_snapshots` (`household_id`,`created_at`);