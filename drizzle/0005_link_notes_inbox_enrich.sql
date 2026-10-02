ALTER TABLE `favorites` ADD `notes` text;--> statement-breakpoint
ALTER TABLE `favorites` ADD `enriched_at` integer;--> statement-breakpoint
ALTER TABLE `favorites` ADD `inbox_at` integer;--> statement-breakpoint
CREATE INDEX `favorites_inbox_idx` ON `favorites` (`workspace_id`,`inbox_at`);