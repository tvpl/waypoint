CREATE TABLE `task_templates` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`name` text NOT NULL,
	`color` text DEFAULT 'lavender' NOT NULL,
	`boards_json` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `task_templates_ws_name` ON `task_templates` (`workspace_id`,`name`);--> statement-breakpoint
ALTER TABLE `tasks` ADD `follow_up_date` text;--> statement-breakpoint
ALTER TABLE `tasks` ADD `depends_on_json` text DEFAULT '[]' NOT NULL;