CREATE TABLE `task_links` (
	`task_id` text NOT NULL,
	`workspace_id` text NOT NULL,
	`target_type` text NOT NULL,
	`target_id` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	PRIMARY KEY(`task_id`, `target_type`, `target_id`),
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `task_links_target_idx` ON `task_links` (`target_type`,`target_id`);--> statement-breakpoint
ALTER TABLE `collections` ADD `deleted_at` integer;--> statement-breakpoint
ALTER TABLE `favorites` ADD `deleted_at` integer;--> statement-breakpoint
ALTER TABLE `plans` ADD `deleted_at` integer;--> statement-breakpoint
ALTER TABLE `tasks` ADD `recurrence` text DEFAULT '' NOT NULL;