CREATE TABLE `trading_account_promotions` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`created_by_user_id` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`source_account_id` text NOT NULL,
	`target_account_id` text NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`source_account_id`,`household_id`) REFERENCES `trading_accounts`(`id`,`household_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`target_account_id`,`household_id`) REFERENCES `trading_accounts`(`id`,`household_id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "trading_promotion_distinct" CHECK("trading_account_promotions"."source_account_id" <> "trading_account_promotions"."target_account_id")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `trading_promotion_source` ON `trading_account_promotions` (`household_id`,`source_account_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `trading_promotion_target` ON `trading_account_promotions` (`household_id`,`target_account_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `trading_promotion_submission` ON `trading_account_promotions` (`household_id`,`idempotency_key`);