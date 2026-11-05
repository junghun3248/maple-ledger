import type { LedgerRecord } from '@/contracts/ledger/request';
import type { BossState } from '@/contracts/boss/state';
import { settle } from '@/features/boss/model';
export function incomeSeries(
  records: LedgerRecord[],
  bosses: BossState,
  start: string,
  end: string,
) {
  const daily = new Map<string, { hunting: bigint; boss: bigint }>();
  function add(date: string, hunting: bigint, boss: bigint) {
    const old = daily.get(date) || { hunting: 0n, boss: 0n };
    daily.set(date, { hunting: old.hunting + hunting, boss: old.boss + boss });
  }
  for (const r of records) add(r.date, BigInt(r.am) - BigInt(r.bm), 0n);
  for (const c of bosses.characters) for (const r of c.runs) add(r.date, 0n, settle(r).total);
  let hunting = 0n,
    boss = 0n;
  for (const [date, value] of daily)
    if (date < start) {
      hunting += value.hunting;
      boss += value.boss;
    }
  const result = [];
  const cursor = new Date(start + 'T00:00:00Z');
  while (cursor.toISOString().slice(0, 10) <= end) {
    const date = cursor.toISOString().slice(0, 10);
    const day = daily.get(date) || { hunting: 0n, boss: 0n };
    hunting += day.hunting;
    boss += day.boss;
    result.push({
      date,
      hunting,
      boss,
      total: hunting + boss,
      dailyHunting: day.hunting,
      dailyBoss: day.boss,
    });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return result;
}
