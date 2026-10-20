CREATE TABLE `bank_refund_members` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`refund_id` text NOT NULL,
	`member_id` text NOT NULL,
	FOREIGN KEY (`refund_id`,`household_id`) REFERENCES `bank_refunds`(`id`,`household_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`member_id`,`household_id`) REFERENCES `household_members`(`id`,`household_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bank_refund_member_once` ON `bank_refund_members` (`refund_id`,`member_id`);