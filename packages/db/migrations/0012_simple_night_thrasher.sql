ALTER TABLE `bill_periods` ADD `billing_period` text DEFAULT '' NOT NULL;
--> statement-breakpoint
UPDATE `bill_periods` SET `billing_period` = `due_date` WHERE `billing_period` = '';
