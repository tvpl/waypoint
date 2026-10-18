CREATE TABLE `home_shortcuts` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`workspace_id` text NOT NULL,
	`title` text NOT NULL,
	`href` text NOT NULL,
	`icon` text DEFAULT 'link' NOT NULL,
	`color` text DEFAULT 'accent' NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `home_shortcuts_user_idx` ON `home_shortcuts` (`user_id`,`workspace_id`,`position`);--> statement-breakpoint
CREATE TABLE `task_events` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`workspace_id` text NOT NULL,
	`user_id` text,
	`kind` text NOT NULL,
	`from_status` text,
	`to_status` text,
	`body` text DEFAULT '' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `task_events_task_idx` ON `task_events` (`task_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `task_events_ws_idx` ON `task_events` (`workspace_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `user_preferences` (
	`user_id` text NOT NULL,
	`workspace_id` text NOT NULL,
	`key` text NOT NULL,
	`value_json` text NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	PRIMARY KEY(`user_id`, `workspace_id`, `key`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `workspace_backups` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`created_by` text,
	`kind` text NOT NULL,
	`note` text,
	`source_workspace_id` text NOT NULL,
	`source_workspace_name` text NOT NULL,
	`taken_at` integer NOT NULL,
	`size` integer NOT NULL,
	`counts_json` text DEFAULT '{}' NOT NULL,
	`data` blob NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `workspace_backups_ws_idx` ON `workspace_backups` (`workspace_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `workspace_settings` (
	`workspace_id` text PRIMARY KEY NOT NULL,
	`backup_frequency` text DEFAULT 'daily' NOT NULL,
	`backup_keep` integer DEFAULT 14 NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
