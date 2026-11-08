CREATE TABLE `daily_visit_totals` (
	`day` text PRIMARY KEY NOT NULL,
	`count` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `daily_visitors` (
	`day` text NOT NULL,
	`visitor` text NOT NULL,
	PRIMARY KEY(`day`, `visitor`)
);

--> statement-breakpoint
CREATE TRIGGER daily_visitors_increment AFTER INSERT ON daily_visitors
BEGIN
  INSERT INTO daily_visit_totals (day,count) VALUES (NEW.day,1)
  ON CONFLICT(day) DO UPDATE SET count=count+1;
END;
