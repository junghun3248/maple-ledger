import type { LedgerRecord } from '@/contracts/ledger/request';
import type { BossState } from '@/contracts/boss/state';
import type { Expense } from '@/contracts/ledger/finance-schema';
import { settle } from '@/features/boss/model';
import { isEnhancementSpend } from './enhancement-model';
export function incomeSeries(
  records: LedgerRecord[],
  bosses: BossState,
  start: string,
  end: string,
  expenses: Expense[] = [],
) {
  const daily = new Map<string, { hunting: bigint; boss: bigint; spend: bigint }>();
  function add(date: string, hunting: bigint, boss: bigint, spend = 0n) {
    const old = daily.get(date) || { hunting: 0n, boss: 0n, spend: 0n };
    daily.set(date, {
      hunting: old.hunting + hunting,
      boss: old.boss + boss,
      spend: old.spend + spend,
    });
  }
  for (const r of records) add(r.date, BigInt(r.am) - BigInt(r.bm), 0n);
  for (const c of bosses.characters) for (const r of c.runs) add(r.date, 0n, settle(r).total);
  for (const e of expenses) if (isEnhancementSpend(e)) add(e.date, 0n, 0n, BigInt(e.amount));
  let hunting = 0n,
    boss = 0n,
    spend = 0n;
  for (const [date, value] of daily)
    if (date < start) {
      hunting += value.hunting;
      boss += value.boss;
      spend += value.spend;
    }
  const result = [];
  const cursor = new Date(start + 'T00:00:00Z');
  while (cursor.toISOString().slice(0, 10) <= end) {
    const date = cursor.toISOString().slice(0, 10);
    const day = daily.get(date) || { hunting: 0n, boss: 0n, spend: 0n };
    hunting += day.hunting;
    boss += day.boss;
    spend += day.spend;
    result.push({
      date,
      hunting,
      boss,
      spend,
      // 전체 = 사냥 + 보스 − 강화 비용
      total: hunting + boss - spend,
      dailyHunting: day.hunting,
      dailyBoss: day.boss,
      dailySpend: day.spend,
    });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return result;
}
