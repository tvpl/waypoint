CREATE TABLE `task_boards` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`project_id` text,
	`name` text NOT NULL,
	`is_default` integer DEFAULT false NOT NULL,
	`columns_json` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `task_projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `task_boards_workspace_idx` ON `task_boards` (`workspace_id`,`project_id`);--> statement-breakpoint
ALTER TABLE `tasks` ADD `block_id` text REFERENCES task_boards(id) ON DELETE set null;--> statement-breakpoint
ALTER TABLE `tasks` ADD `column_id` text;--> statement-breakpoint
ALTER TABLE `tasks` ADD `pending_kind` text DEFAULT 'note' NOT NULL;