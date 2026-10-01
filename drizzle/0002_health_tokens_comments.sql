CREATE TABLE `api_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`workspace_id` text NOT NULL,
	`name` text NOT NULL,
	`token_hash` text NOT NULL,
	`prefix` text NOT NULL,
	`last_used_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `api_tokens_token_hash_unique` ON `api_tokens` (`token_hash`);--> statement-breakpoint
CREATE INDEX `api_tokens_user_idx` ON `api_tokens` (`user_id`);--> statement-breakpoint
CREATE TABLE `plan_comments` (
	`id` text PRIMARY KEY NOT NULL,
	`plan_id` text NOT NULL,
	`node_id` text,
	`parent_id` text,
	`user_id` text NOT NULL,
	`body` text NOT NULL,
	`resolved_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`plan_id`) REFERENCES `plans`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `plan_comments_plan_idx` ON `plan_comments` (`plan_id`,`created_at`);--> statement-breakpoint
ALTER TABLE `favorites` ADD `health_status` text DEFAULT 'unknown' NOT NULL;--> statement-breakpoint
ALTER TABLE `favorites` ADD `health_code` integer;--> statement-breakpoint
ALTER TABLE `favorites` ADD `health_checked_at` integer;--> statement-breakpoint
ALTER TABLE `favorites` ADD `health_final_url` text;