CREATE TABLE `bank_account_members` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`account_id` text NOT NULL,
	`member_id` text NOT NULL,
	FOREIGN KEY (`account_id`,`household_id`) REFERENCES `bank_accounts`(`id`,`household_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`member_id`,`household_id`) REFERENCES `household_members`(`id`,`household_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bank_member_access_once` ON `bank_account_members` (`account_id`,`member_id`);--> statement-breakpoint
CREATE TABLE `bank_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`connection_id` text,
	`provider_account_id` text,
	`name` text NOT NULL,
	`institution` text NOT NULL,
	`type` text NOT NULL,
	`subtype` text,
	`mask` text,
	`currency` text,
	`status` text NOT NULL,
	`asset_id` text,
	`debt_id` text,
	`revision` integer NOT NULL,
	`idempotency_key` text NOT NULL,
	`created_by_user_id` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`connection_id`,`household_id`) REFERENCES `bank_connections`(`id`,`household_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`asset_id`,`household_id`) REFERENCES `assets`(`id`,`household_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`debt_id`,`household_id`) REFERENCES `debts`(`id`,`household_id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "bank_account_type" CHECK("bank_accounts"."type" in ('checking','savings','credit_card','other_depository')),
	CONSTRAINT "bank_account_state" CHECK("bank_accounts"."status" in ('active','hidden')),
	CONSTRAINT "bank_mask_length" CHECK("bank_accounts"."mask" is null or length("bank_accounts"."mask") between 1 and 4),
	CONSTRAINT "bank_link_kind" CHECK(("bank_accounts"."asset_id" is null or "bank_accounts"."type"<>'credit_card') and ("bank_accounts"."debt_id" is null or "bank_accounts"."type"='credit_card')),
	CONSTRAINT "bank_account_revision" CHECK("bank_accounts"."revision">0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bank_account_home_id` ON `bank_accounts` (`id`,`household_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `bank_provider_account_unique` ON `bank_accounts` (`connection_id`,`provider_account_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `bank_account_submit` ON `bank_accounts` (`household_id`,`idempotency_key`);--> statement-breakpoint
CREATE INDEX `bank_account_home_state` ON `bank_accounts` (`household_id`,`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `bank_asset_link_once` ON `bank_accounts` (`asset_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `bank_debt_link_once` ON `bank_accounts` (`debt_id`);--> statement-breakpoint
CREATE TABLE `bank_balance_observations` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`account_id` text NOT NULL,
	`current_cents` integer,
	`available_cents` integer,
	`observed_at` text NOT NULL,
	`institution_as_of` text,
	`source` text NOT NULL,
	`notes` text,
	`created_at` text NOT NULL,
	`idempotency_key` text NOT NULL,
	FOREIGN KEY (`account_id`,`household_id`) REFERENCES `bank_accounts`(`id`,`household_id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "bank_current_safe" CHECK(("bank_balance_observations"."current_cents" is null or "bank_balance_observations"."current_cents" between -9007199254740991 and 9007199254740991) and ("bank_balance_observations"."current_cents" is null or cast("bank_balance_observations"."current_cents" as integer)="bank_balance_observations"."current_cents")),
	CONSTRAINT "bank_available_safe" CHECK(("bank_balance_observations"."available_cents" is null or "bank_balance_observations"."available_cents" between -9007199254740991 and 9007199254740991) and ("bank_balance_observations"."available_cents" is null or cast("bank_balance_observations"."available_cents" as integer)="bank_balance_observations"."available_cents")),
	CONSTRAINT "bank_observation_source" CHECK("bank_balance_observations"."source" in ('manual','plaid_cached'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bank_balance_submit` ON `bank_balance_observations` (`account_id`,`idempotency_key`);--> statement-breakpoint
CREATE INDEX `bank_balance_date` ON `bank_balance_observations` (`account_id`,`observed_at`);--> statement-breakpoint
CREATE TABLE `bank_connections` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`environment` text NOT NULL,
	`provider_item_id` text NOT NULL,
	`institution_id` text,
	`institution` text NOT NULL,
	`token_ciphertext` text,
	`token_key_id` text,
	`cursor` text,
	`status` text NOT NULL,
	`error_code` text,
	`last_sync_at` text,
	`revision` integer NOT NULL,
	`created_by_user_id` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "bank_environment" CHECK("bank_connections"."environment" in ('sandbox','production')),
	CONSTRAINT "bank_connection_state" CHECK("bank_connections"."status" in ('active','disabled','error','reauth_required','disconnected')),
	CONSTRAINT "bank_token_pair" CHECK(("bank_connections"."token_ciphertext" is null) = ("bank_connections"."token_key_id" is null)),
	CONSTRAINT "bank_connection_revision" CHECK("bank_connections"."revision">0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bank_connection_home_id` ON `bank_connections` (`id`,`household_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `bank_provider_item_unique` ON `bank_connections` (`environment`,`provider_item_id`);--> statement-breakpoint
CREATE INDEX `bank_connection_home` ON `bank_connections` (`household_id`);--> statement-breakpoint
CREATE TABLE `plaid_link_attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`actor_user_id` text NOT NULL,
	`environment` text NOT NULL,
	`intent` text NOT NULL,
	`connection_id` text,
	`status` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`public_token_hash` text,
	`expires_at` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`connection_id`,`household_id`) REFERENCES `bank_connections`(`id`,`household_id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "plaid_attempt_intent" CHECK("plaid_link_attempts"."intent" in ('connect','update')),
	CONSTRAINT "plaid_attempt_state" CHECK("plaid_link_attempts"."status" in ('reserved','exchanged','uncertain','failed')),
	CONSTRAINT "plaid_attempt_environment" CHECK("plaid_link_attempts"."environment" in ('sandbox','production'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `plaid_attempt_submit` ON `plaid_link_attempts` (`household_id`,`idempotency_key`);--> statement-breakpoint
CREATE INDEX `plaid_lifetime_usage` ON `plaid_link_attempts` (`environment`,`intent`);--> statement-breakpoint
CREATE TABLE `bank_audit` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`actor_user_id` text NOT NULL,
	`target_id` text NOT NULL,
	`action` text NOT NULL,
	`details_json` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `bank_audit_target` ON `bank_audit` (`household_id`,`target_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `bank_import_batches` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`account_id` text NOT NULL,
	`source` text NOT NULL,
	`source_hash` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`actor_user_id` text NOT NULL,
	`record_count` integer NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`account_id`,`household_id`) REFERENCES `bank_accounts`(`id`,`household_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bank_batch_home_id` ON `bank_import_batches` (`id`,`household_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `bank_batch_submit` ON `bank_import_batches` (`household_id`,`idempotency_key`);--> statement-breakpoint
CREATE TABLE `bank_merchant_rules` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`account_id` text NOT NULL,
	`merchant` text NOT NULL,
	`classification` text NOT NULL,
	`category_id` text NOT NULL,
	`created_by_user_id` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`account_id`,`household_id`) REFERENCES `bank_accounts`(`id`,`household_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`category_id`,`household_id`) REFERENCES `expense_categories`(`id`,`household_id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "bank_rule_kind" CHECK("bank_merchant_rules"."classification" in ('expense','fee'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bank_merchant_rule_once` ON `bank_merchant_rules` (`account_id`,`merchant`);--> statement-breakpoint
CREATE TABLE `bank_transactions` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`account_id` text NOT NULL,
	`source` text NOT NULL,
	`provider_transaction_id` text,
	`fingerprint` text NOT NULL,
	`batch_id` text,
	`date` text NOT NULL,
	`authorized_date` text,
	`amount_cents` integer NOT NULL,
	`currency` text,
	`pending` integer NOT NULL,
	`pending_provider_id` text,
	`replaced_by_id` text,
	`removed` integer NOT NULL,
	`merchant` text,
	`description` text NOT NULL,
	`review_status` text NOT NULL,
	`revision` integer NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`account_id`,`household_id`) REFERENCES `bank_accounts`(`id`,`household_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`batch_id`,`household_id`) REFERENCES `bank_import_batches`(`id`,`household_id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "bank_transaction_amount" CHECK(("bank_transactions"."amount_cents"<>0 and "bank_transactions"."amount_cents" between -9007199254740991 and 9007199254740991) and ("bank_transactions"."amount_cents" is null or cast("bank_transactions"."amount_cents" as integer)="bank_transactions"."amount_cents")),
	CONSTRAINT "bank_transaction_state" CHECK("bank_transactions"."review_status" in ('unreviewed','reconciled','ignored','needs_review','superseded')),
	CONSTRAINT "bank_transaction_source" CHECK("bank_transactions"."source" in ('csv','ofx','plaid')),
	CONSTRAINT "bank_transaction_revision" CHECK("bank_transactions"."revision">0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bank_transaction_home_id` ON `bank_transactions` (`id`,`household_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `bank_provider_transaction_once` ON `bank_transactions` (`account_id`,`provider_transaction_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `bank_import_fingerprint_once` ON `bank_transactions` (`account_id`,`fingerprint`);--> statement-breakpoint
CREATE INDEX `bank_inbox` ON `bank_transactions` (`household_id`,`review_status`,`date`);--> statement-breakpoint
CREATE TABLE `bank_reconciliations` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`transaction_id` text NOT NULL,
	`classification` text NOT NULL,
	`expense_id` text,
	`income_id` text,
	`debt_payment_id` text,
	`bill_payment_id` text,
	`refund_id` text,
	`transfer_id` text,
	`transaction_revision` integer NOT NULL,
	`target_fingerprint` text,
	`created_by_user_id` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`transaction_id`,`household_id`) REFERENCES `bank_transactions`(`id`,`household_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`expense_id`,`household_id`) REFERENCES `expenses`(`id`,`household_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`income_id`,`household_id`) REFERENCES `income_transactions`(`id`,`household_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`debt_payment_id`,`household_id`) REFERENCES `debt_payments`(`id`,`household_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`bill_payment_id`,`household_id`) REFERENCES `bill_payments`(`id`,`household_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`refund_id`,`household_id`) REFERENCES `bank_refunds`(`id`,`household_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`transfer_id`,`household_id`) REFERENCES `bank_transfers`(`id`,`household_id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "bank_reconcile_kind" CHECK("bank_reconciliations"."classification" in ('expense','bill_payment','debt_payment','income','transfer','refund','fee','ignore')),
	CONSTRAINT "bank_reconcile_target" CHECK((case when "bank_reconciliations"."expense_id" is null then 0 else 1 end)+(case when "bank_reconciliations"."income_id" is null then 0 else 1 end)+(case when "bank_reconciliations"."debt_payment_id" is null then 0 else 1 end)+(case when "bank_reconciliations"."bill_payment_id" is null then 0 else 1 end)+(case when "bank_reconciliations"."refund_id" is null then 0 else 1 end)+(case when "bank_reconciliations"."transfer_id" is null then 0 else 1 end)=(case when "bank_reconciliations"."classification"='ignore' then 0 else 1 end))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bank_reconcile_once` ON `bank_reconciliations` (`transaction_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `bank_expense_authority_once` ON `bank_reconciliations` (`expense_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `bank_income_authority_once` ON `bank_reconciliations` (`income_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `bank_debt_payment_authority_once` ON `bank_reconciliations` (`debt_payment_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `bank_bill_payment_authority_once` ON `bank_reconciliations` (`bill_payment_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `bank_refund_authority_once` ON `bank_reconciliations` (`refund_id`);--> statement-breakpoint
CREATE TABLE `bank_refund_allocations` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`refund_id` text NOT NULL,
	`category_id` text NOT NULL,
	`amount_cents` integer NOT NULL,
	FOREIGN KEY (`refund_id`,`household_id`) REFERENCES `bank_refunds`(`id`,`household_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`category_id`,`household_id`) REFERENCES `expense_categories`(`id`,`household_id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "bank_refund_allocation_amount" CHECK(("bank_refund_allocations"."amount_cents">0 and "bank_refund_allocations"."amount_cents"<=9007199254740991) and ("bank_refund_allocations"."amount_cents" is null or cast("bank_refund_allocations"."amount_cents" as integer)="bank_refund_allocations"."amount_cents"))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bank_refund_category_once` ON `bank_refund_allocations` (`refund_id`,`category_id`);--> statement-breakpoint
CREATE TABLE `bank_refunds` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`transaction_id` text NOT NULL,
	`expense_id` text,
	`bill_payment_id` text,
	`debt_payment_id` text,
	`amount_cents` integer NOT NULL,
	`date` text NOT NULL,
	`method` text NOT NULL,
	`status` text NOT NULL,
	`notes` text,
	`created_by_user_id` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`transaction_id`,`household_id`) REFERENCES `bank_transactions`(`id`,`household_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`expense_id`,`household_id`) REFERENCES `expenses`(`id`,`household_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`bill_payment_id`,`household_id`) REFERENCES `bill_payments`(`id`,`household_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`debt_payment_id`,`household_id`) REFERENCES `debt_payments`(`id`,`household_id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "bank_refund_parent" CHECK((case when "bank_refunds"."expense_id" is null then 0 else 1 end)+(case when "bank_refunds"."bill_payment_id" is null then 0 else 1 end)+(case when "bank_refunds"."debt_payment_id" is null then 0 else 1 end)=1),
	CONSTRAINT "bank_refund_amount" CHECK(("bank_refunds"."amount_cents">0 and "bank_refunds"."amount_cents"<=9007199254740991) and ("bank_refunds"."amount_cents" is null or cast("bank_refunds"."amount_cents" as integer)="bank_refunds"."amount_cents")),
	CONSTRAINT "bank_refund_state" CHECK("bank_refunds"."status" in ('completed','cancelled'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bank_refund_home_id` ON `bank_refunds` (`id`,`household_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `bank_refund_transaction_once` ON `bank_refunds` (`transaction_id`);--> statement-breakpoint
CREATE TABLE `bank_review_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`transaction_id` text NOT NULL,
	`transaction_revision` integer NOT NULL,
	`proposal_json` text NOT NULL,
	`target_fingerprint` text NOT NULL,
	`status` text NOT NULL,
	`proposed_by_user_id` text NOT NULL,
	`reviewed_by_user_id` text,
	`reviewed_at` text,
	`idempotency_key` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`proposed_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`reviewed_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`transaction_id`,`household_id`) REFERENCES `bank_transactions`(`id`,`household_id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "bank_review_state" CHECK("bank_review_requests"."status" in ('pending','approved','rejected','cancelled'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bank_review_submission` ON `bank_review_requests` (`household_id`,`idempotency_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `bank_review_pending_once` ON `bank_review_requests` (`transaction_id`) WHERE "bank_review_requests"."status"='pending';--> statement-breakpoint
CREATE INDEX `bank_review_home` ON `bank_review_requests` (`household_id`,`status`);--> statement-breakpoint
CREATE TABLE `bank_transfer_legs` (
	`transaction_id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`transfer_id` text NOT NULL,
	`direction` text NOT NULL,
	FOREIGN KEY (`transfer_id`,`household_id`) REFERENCES `bank_transfers`(`id`,`household_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`transaction_id`,`household_id`) REFERENCES `bank_transactions`(`id`,`household_id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "bank_transfer_direction" CHECK("bank_transfer_legs"."direction" in ('inflow','outflow'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bank_transfer_direction_once` ON `bank_transfer_legs` (`transfer_id`,`direction`);--> statement-breakpoint
CREATE TABLE `bank_transfers` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`created_by_user_id` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bank_transfer_home_id` ON `bank_transfers` (`id`,`household_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `debt_payment_home_id` ON `debt_payments` (`id`,`household_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `bill_payment_home_id` ON `bill_payments` (`id`,`household_id`);