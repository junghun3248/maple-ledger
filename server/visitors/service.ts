import { koreaDate } from '@/lib/ledger/korea-date';
export async function countVisit(db: D1Database, visitor: string, now = Date.now()) {
  const day = koreaDate(now);
  const bytes = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(day + ':' + visitor),
  );
  const hash = Array.from(new Uint8Array(bytes), (v) => v.toString(16).padStart(2, '0')).join('');
  const results = await db.batch([
    db.prepare('INSERT OR IGNORE INTO daily_visitors (day,visitor) VALUES (?,?)').bind(day, hash),
    db.prepare('SELECT count FROM daily_visit_totals WHERE day=?').bind(day),
    db
      .prepare(
        'DELETE FROM daily_visitors WHERE rowid IN (SELECT rowid FROM daily_visitors WHERE day<? LIMIT 100)',
      )
      .bind(koreaDate(now - 7 * 86400000)),
  ]);
  const row = results[1].results[0] as { count: number } | undefined;
  return { day, count: row?.count ?? 0 };
}
