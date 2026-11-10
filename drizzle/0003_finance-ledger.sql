ALTER TABLE `ledger_books` ADD `finance` text NOT NULL DEFAULT '{"opening":null,"expenses":[],"adjustments":[],"goals":[],"sales":[]}';
--> statement-breakpoint
ALTER TABLE `ledger_books` ADD `finance_revision` integer NOT NULL DEFAULT 0;

