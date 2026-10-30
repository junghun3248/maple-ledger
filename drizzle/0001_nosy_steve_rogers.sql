CREATE TABLE `boss_plans` (
	`book` text PRIMARY KEY NOT NULL,
	`data` text DEFAULT '{"characters":[]}' NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL
);
