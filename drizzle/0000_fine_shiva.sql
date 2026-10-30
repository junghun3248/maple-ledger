CREATE TABLE `ledger_books` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`salt` text NOT NULL,
	`password` text NOT NULL,
	`records` text DEFAULT '[]' NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ledger_books_name_unique` ON `ledger_books` (`name`);--> statement-breakpoint
CREATE TABLE `ledger_limits` (
	`key` text PRIMARY KEY NOT NULL,
	`count` integer NOT NULL,
	`expires` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `ledger_sessions` (
	`token` text PRIMARY KEY NOT NULL,
	`book` text NOT NULL,
	`expires` integer NOT NULL
);
