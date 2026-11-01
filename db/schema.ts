import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
export const books = sqliteTable('ledger_books', {
  id: text('id').primaryKey(),
  name: text('name').notNull().unique(),
  salt: text('salt').notNull(),
  password: text('password').notNull(),
  records: text('records').notNull().default('[]'),
  revision: integer('revision').notNull().default(0),
});
export const sessions = sqliteTable('ledger_sessions', {
  token: text('token').primaryKey(),
  book: text('book').notNull(),
  expires: integer('expires').notNull(),
});
export const limits = sqliteTable('ledger_limits', {
  key: text('key').primaryKey(),
  count: integer('count').notNull(),
  expires: integer('expires').notNull(),
});

export const bossPlans = sqliteTable('boss_plans', {
  book: text('book').primaryKey(),
  data: text('data').notNull().default('{"characters":[]}'),
  revision: integer('revision').notNull().default(0),
});
