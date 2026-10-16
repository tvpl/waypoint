CREATE TABLE `task_reminders` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`workspace_id` text NOT NULL,
	`user_id` text NOT NULL,
	`kind` text NOT NULL,
	`deadline_at` integer NOT NULL,
	`date_only` integer DEFAULT false NOT NULL,
	`time_zone` text NOT NULL,
	`lead_minutes` integer DEFAULT 0 NOT NULL,
	`channel` text DEFAULT 'sound' NOT NULL,
	`snooze_minutes` integer DEFAULT 15 NOT NULL,
	`next_at` integer NOT NULL,
	`state` text DEFAULT 'scheduled' NOT NULL,
	`delivered_at` integer,
	`snoozed` integer DEFAULT false NOT NULL,
	`lease_until` integer,
	`claim_token` text,
	`last_error` text,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `task_reminders_person_kind` ON `task_reminders` (`user_id`,`task_id`,`kind`);--> statement-breakpoint
CREATE INDEX `task_reminders_due_idx` ON `task_reminders` (`user_id`,`state`,`next_at`);