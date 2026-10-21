CREATE TABLE `payroll_upload_receipts` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`actor_user_id` text NOT NULL,
	`document_digest` text NOT NULL,
	`received_at` text NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `payroll_upload_receipt_document` ON `payroll_upload_receipts` (`household_id`,`actor_user_id`,`document_digest`);--> statement-breakpoint
CREATE INDEX `payroll_upload_receipt_actor` ON `payroll_upload_receipts` (`household_id`,`actor_user_id`,`received_at`);