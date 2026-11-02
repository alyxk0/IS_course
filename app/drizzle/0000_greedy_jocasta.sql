CREATE TABLE `auth_rate` (
	`key` text PRIMARY KEY NOT NULL,
	`attempts` integer NOT NULL,
	`expires` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `document_states` (
	`document_id` text NOT NULL,
	`revision` integer NOT NULL,
	`part` integer NOT NULL,
	`content` text NOT NULL,
	PRIMARY KEY(`document_id`, `revision`, `part`),
	FOREIGN KEY (`document_id`,`revision`) REFERENCES `versions`(`document_id`,`revision`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `documents` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`title` text NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`updated` integer NOT NULL,
	`mutation_id` text DEFAULT '' NOT NULL,
	`change_type` text DEFAULT 'create' NOT NULL,
	`structure_revision` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`owner`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `documents_owner_idx` ON `documents` (`owner`);--> statement-breakpoint
CREATE TABLE `history` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`document_id` text NOT NULL,
	`user_id` text NOT NULL,
	`revision` integer NOT NULL,
	`changes` text NOT NULL,
	`created` integer NOT NULL,
	FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `history_document_idx` ON `history` (`document_id`,`revision`);--> statement-breakpoint
CREATE TABLE `mutations` (
	`document_id` text NOT NULL,
	`request_id` text NOT NULL,
	`user_id` text NOT NULL,
	`revision` integer NOT NULL,
	`created` integer NOT NULL,
	PRIMARY KEY(`document_id`, `request_id`),
	FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `permissions` (
	`document_id` text NOT NULL,
	`email` text NOT NULL,
	`role` text NOT NULL,
	PRIMARY KEY(`document_id`, `email`),
	FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "permissions_role_check" CHECK("permissions"."role" in ('viewer','commenter','editor'))
);
--> statement-breakpoint
CREATE INDEX `permissions_email_idx` ON `permissions` (`email`);--> statement-breakpoint
CREATE TABLE `presence` (
	`document_id` text NOT NULL,
	`client_id` text NOT NULL,
	`user_id` text NOT NULL,
	`session_token` text NOT NULL,
	`cursor` text,
	`updated` integer NOT NULL,
	PRIMARY KEY(`document_id`, `client_id`),
	FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`session_token`) REFERENCES `sessions`(`token`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `presence_updated_idx` ON `presence` (`updated`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`token` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`expires` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sessions_user_idx` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`name` text NOT NULL,
	`password` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE TABLE `versions` (
	`document_id` text NOT NULL,
	`revision` integer NOT NULL,
	`user_id` text NOT NULL,
	`title` text NOT NULL,
	`created` integer NOT NULL,
	PRIMARY KEY(`document_id`, `revision`),
	FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
