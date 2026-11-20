CREATE TABLE `feedback_posts` (
	`id` text PRIMARY KEY NOT NULL,
	`body` text NOT NULL,
	`created_at` integer NOT NULL,
	`reply` text DEFAULT '' NOT NULL,
	`replied_at` integer DEFAULT 0 NOT NULL
);
