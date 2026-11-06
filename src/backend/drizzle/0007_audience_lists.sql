CREATE TABLE `audience_contacts` (
	`id` text PRIMARY KEY NOT NULL,
	`list_id` text NOT NULL,
	`email` text NOT NULL,
	`name` text,
	`variables` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`list_id`) REFERENCES `audience_lists`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `audienceContacts_listId_idx` ON `audience_contacts` (`list_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `audienceContacts_listId_email_unique` ON `audience_contacts` (`list_id`,`email`);--> statement-breakpoint
CREATE TABLE `audience_lists` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `audienceLists_userId_idx` ON `audience_lists` (`user_id`);