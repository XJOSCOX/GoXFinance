ALTER TABLE `copy_event_results` ADD `profit_cents` integer;--> statement-breakpoint
ALTER TABLE `copy_event_results` ADD `loss_cents` integer;--> statement-breakpoint
ALTER TABLE `copy_event_results` ADD `fees_included` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `trading_results` ADD `fees_included` integer DEFAULT false NOT NULL;