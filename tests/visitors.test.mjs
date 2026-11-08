import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { countVisit } from '../server/visitors/service.ts';
import { koreaDate, untilKoreaMidnight } from '../lib/ledger/korea-date.ts';
function database() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(readFileSync(new URL('../drizzle/0002_daily-visitors.sql', import.meta.url), 'utf8'));
  const db = {
    prepare: (sql) => ({ bind: (...values) => ({ sql, values }) }),
    batch: async (statements) => {
      sqlite.exec('BEGIN');
      try {
        const results = statements.map(({ sql, values }) => ({
          results: sqlite.prepare(sql).all(...values),
        }));
        sqlite.exec('COMMIT');
        return results;
      } catch (e) {
        sqlite.exec('ROLLBACK');
        throw e;
      }
    },
  };
  return { sqlite, db };
}
test('Korean midnight boundary uses UTC+9 regardless of host timezone', () => {
  const before = Date.parse('2026-11-08T14:59:59Z');
  assert.equal(koreaDate(before), '2026-11-08');
  assert.equal(untilKoreaMidnight(before), 1000);
  assert.equal(koreaDate(before + 1000), '2026-11-09');
});
test('same browser and concurrent reloads count once; another day counts again', async () => {
  const { sqlite, db } = database();
  const now = Date.parse('2026-11-08T10:00:00Z');
  try {
    await Promise.all(Array.from({ length: 8 }, () => countVisit(db, 'browser-a', now)));
    assert.deepEqual(await countVisit(db, 'browser-a', now), { day: '2026-11-08', count: 1 });
    assert.equal((await countVisit(db, 'browser-b', now)).count, 2);
    assert.deepEqual(await countVisit(db, 'browser-a', now + 86400000), {
      day: '2026-11-09',
      count: 1,
    });
    assert.ok(
      !JSON.stringify(sqlite.prepare('SELECT * FROM daily_visitors').all()).includes('browser-a'),
    );
  } finally {
    sqlite.close();
  }
});
test('expired deduplication tokens are removed without losing daily totals', async () => {
  const { sqlite, db } = database();
  const now = Date.parse('2026-11-08T10:00:00Z');
  try {
    await countVisit(db, 'browser-a', now);
    await countVisit(db, 'browser-b', now + 9 * 86400000);
    assert.equal(
      sqlite.prepare('SELECT count FROM daily_visit_totals WHERE day=?').get('2026-11-08').count,
      1,
    );
    assert.equal(
      sqlite.prepare('SELECT count(*) AS n FROM daily_visitors WHERE day=?').get('2026-11-08').n,
      0,
    );
  } finally {
    sqlite.close();
  }
});
