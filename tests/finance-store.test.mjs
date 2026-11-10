import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { financeAction } from '../server/ledger/finance-store.ts';
import { emptyAssets } from '../features/income/asset-model.ts';

test('migration preserves existing ledgers; finance save is scoped and revision guarded', async () => {
  const sqlite = new DatabaseSync(':memory:');
  try {
    const entries = JSON.parse(
      readFileSync(new URL('../drizzle/meta/_journal.json', import.meta.url), 'utf8'),
    ).entries;
    for (const entry of entries.slice(0, -1))
      sqlite.exec(
        readFileSync(new URL('../drizzle/' + entry.tag + '.sql', import.meta.url), 'utf8'),
      );
    sqlite
      .prepare(
        'INSERT INTO ledger_books(id,name,salt,password,records,revision) VALUES(?,?,?,?,?,?)',
      )
      .run('a', 'first', 'salt', 'hash', '[]', 3);
    sqlite
      .prepare('INSERT INTO ledger_books(id,name,salt,password) VALUES(?,?,?,?)')
      .run('b', 'second', 'salt', 'hash');
    sqlite
      .prepare('INSERT INTO boss_plans(book,data,revision) VALUES(?,?,?)')
      .run('a', '{"characters":[]}', 4);
    sqlite.exec(
      readFileSync(new URL('../drizzle/0003_finance-ledger.sql', import.meta.url), 'utf8'),
    );
    const db = {
      prepare: (sql) => ({
        bind: (...args) => ({
          first: async () => sqlite.prepare(sql).get(...args),
          run: async () => ({ meta: { changes: sqlite.prepare(sql).run(...args).changes } }),
        }),
      }),
    };
    const book = { id: 'a', name: 'first', records: '[]', revision: 3 };
    const read = await (await financeAction(db, book, { action: 'finance-read' })).json();
    assert.equal(read.bookId, 'a');
    assert.equal(read.revision, 0);
    assert.deepEqual(read.finance, emptyAssets());
    const finance = {
      ...emptyAssets(),
      opening: { amount: '1000', at: '2026-11-10T00:00:00Z', legacyDateChoice: 'exclude' },
    };
    assert.equal(
      (await financeAction(db, book, { action: 'finance-save', bookId: 'b', revision: 0, finance }))
        .status,
      409,
    );
    const results = await Promise.all(
      [0, 1].map(() =>
        financeAction(db, book, { action: 'finance-save', bookId: 'a', revision: 0, finance }),
      ),
    );
    assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
    const again = await (await financeAction(db, book, { action: 'finance-read' })).json();
    assert.deepEqual(again.finance, finance);
    assert.equal(again.revision, 1);
    assert.equal(
      sqlite.prepare('SELECT revision FROM ledger_books WHERE id=?').get('a').revision,
      3,
    );
    assert.equal(
      sqlite.prepare('SELECT revision FROM boss_plans WHERE book=?').get('a').revision,
      4,
    );
    assert.equal(
      sqlite.prepare('SELECT finance_revision FROM ledger_books WHERE id=?').get('b')
        .finance_revision,
      0,
    );
  } finally {
    sqlite.close();
  }
});
