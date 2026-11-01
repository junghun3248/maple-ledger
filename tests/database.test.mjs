import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { getTableConfig } from 'drizzle-orm/sqlite-core';
import * as schema from '../db/schema.ts';
test('migration tables and columns match Drizzle declarations', () => {
  const db = new DatabaseSync(':memory:');
  try {
    for (const name of ['0000_fine_shiva.sql', '0001_nosy_steve_rogers.sql'])
      db.exec(readFileSync(new URL('../drizzle/' + name, import.meta.url), 'utf8'));
    for (const table of Object.values(schema)) {
      const config = getTableConfig(table);
      const actual = db
        .prepare('SELECT name,"notnull" AS required,pk FROM pragma_table_info(?)')
        .all(config.name);
      assert.deepEqual(
        actual.map((c) => c.name),
        config.columns.map((c) => c.name),
      );
      assert.ok(actual.every((c) => c.required || c.pk));
    }
    db.prepare('INSERT INTO ledger_books(id,name,salt,password) VALUES(?,?,?,?)').run(
      'A',
      'book',
      'salt',
      'hash',
    );
    assert.throws(() =>
      db
        .prepare('INSERT INTO ledger_books(id,name,salt,password) VALUES(?,?,?,?)')
        .run('B', 'book', 'salt', 'hash'),
    );
    assert.deepEqual(
      JSON.parse(db.prepare('SELECT records FROM ledger_books WHERE id=?').get('A').records),
      [],
    );
  } finally {
    db.close();
  }
});
