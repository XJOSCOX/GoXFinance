CREATE TABLE `debts` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`created_by_user_id` text NOT NULL,
	`creditor_name` text NOT NULL,
	`account_nickname` text,
	`account_type` text NOT NULL,
	`account_status` text DEFAULT 'unknown' NOT NULL,
	`payment_status` text DEFAULT 'unknown' NOT NULL,
	`original_balance_cents` integer,
	`current_balance_cents` integer,
	`past_due_amount_cents` integer,
	`credit_limit_cents` integer,
	`interest_rate_apr` text,
	`minimum_payment_cents` integer,
	`due_day` integer,
	`next_due_date` text,
	`last_payment_date` text,
	`opened_date` text,
	`closed_date` text,
	`charged_off_date` text,
	`collection_agency` text,
	`original_creditor` text,
	`linked_original_debt_id` text,
	`duplicate_link_verified` integer DEFAULT false NOT NULL,
	`balance_verified_at` text,
	`confidence` text DEFAULT 'unverified' NOT NULL,
	`notes` text,
	`is_archived` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`linked_original_debt_id`,`household_id`) REFERENCES `debts`(`id`,`household_id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "debts_original_not_self" CHECK("debts"."linked_original_debt_id" is null or "debts"."linked_original_debt_id" <> "debts"."id"),
	CONSTRAINT "debts_verified_link" CHECK("debts"."duplicate_link_verified" = 0 or "debts"."linked_original_debt_id" is not null),
	CONSTRAINT "debts_due_day" CHECK("debts"."due_day" is null or "debts"."due_day" between 1 and 31),
	CONSTRAINT "debts_original_balance" CHECK("debts"."original_balance_cents" is null or "debts"."original_balance_cents" >= 0),
	CONSTRAINT "debts_current_balance" CHECK("debts"."current_balance_cents" is null or "debts"."current_balance_cents" >= 0),
	CONSTRAINT "debts_past_due" CHECK("debts"."past_due_amount_cents" is null or "debts"."past_due_amount_cents" >= 0),
	CONSTRAINT "debts_limit" CHECK("debts"."credit_limit_cents" is null or "debts"."credit_limit_cents" >= 0),
	CONSTRAINT "debts_minimum" CHECK("debts"."minimum_payment_cents" is null or "debts"."minimum_payment_cents" >= 0),
	CONSTRAINT "debts_confidence" CHECK("debts"."confidence" in ('confirmed','estimated','unverified'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `debts_id_household_unique` ON `debts` (`id`,`household_id`);--> statement-breakpoint
CREATE INDEX `debts_household_archived_idx` ON `debts` (`household_id`,`is_archived`);--> statement-breakpoint
CREATE INDEX `debts_household_status_idx` ON `debts` (`household_id`,`payment_status`);--> statement-breakpoint
CREATE INDEX `debts_original_idx` ON `debts` (`linked_original_debt_id`);--> statement-breakpoint
CREATE TABLE `debt_members` (
	`debt_id` text NOT NULL,
	`household_id` text NOT NULL,
	`household_member_id` text NOT NULL,
	`responsibility` text NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`debt_id`, `household_member_id`),
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`debt_id`,`household_id`) REFERENCES `debts`(`id`,`household_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`household_member_id`,`household_id`) REFERENCES `household_members`(`id`,`household_id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "debt_members_responsibility" CHECK("debt_members"."responsibility" in ('primary','joint','authorized_user','other'))
);
--> statement-breakpoint
CREATE INDEX `debt_members_household_member_idx` ON `debt_members` (`household_id`,`household_member_id`);