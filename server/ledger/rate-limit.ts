import { ledgerDatabase as db } from '@/db/ledger';
import { digest } from './auth';

export async function limit(key: string, max: number, period: number) {
  const now = Date.now(),
    bucket = Math.floor(now / period),
    k = await digest(key + ':' + bucket);
  const row = await db()
    .prepare(
      'INSERT INTO ledger_limits (key,count,expires) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count',
    )
    .bind(k, now + period)
    .first<{ count: number }>();
  return !!row && row.count <= max;
}
