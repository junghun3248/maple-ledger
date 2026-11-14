import type { LedgerRecord } from '@/contracts/ledger/request';
import type { BossState } from '@/contracts/boss/state';
import { settle, weekKey } from '@/features/boss/model';
import { incomeSeries } from '@/features/income/model';

export interface Activity {
  date: string;
  kind: '사냥' | '보스';
  title: string;
  amount: bigint;
}

/** 대시보드 요약: 이번 주(목~수)·이번 달 수입과 최근 7일 일별 수입 */
export function dashboardSummary(records: LedgerRecord[], bosses: BossState, today: string) {
  const monthStart = today.slice(0, 8) + '01';
  const weekStart = weekKey(today);
  const start = [monthStart, weekStart].sort()[0];
  const rows = incomeSeries(records, bosses, start, today);
  const sum = (from: string) =>
    rows
      .filter((r) => r.date >= from)
      .reduce((v, r) => ({ hunting: v.hunting + r.dailyHunting, boss: v.boss + r.dailyBoss }), {
        hunting: 0n,
        boss: 0n,
      });
  const weekAgo = new Date(today + 'T00:00:00Z');
  weekAgo.setUTCDate(weekAgo.getUTCDate() - 6);
  const last7 = incomeSeries(records, bosses, weekAgo.toISOString().slice(0, 10), today).map(
    (r) => ({ date: r.date, hunting: r.dailyHunting, boss: r.dailyBoss }),
  );
  return { week: sum(weekStart), weekStart, month: sum(monthStart), last7 };
}

/** 최근 활동: 사냥 기록은 한 건씩, 보스는 날짜별 클리어 묶음으로 */
export function recentActivity(records: LedgerRecord[], bosses: BossState, limit = 8) {
  const items: Activity[] = records.map((r) => ({
    date: r.date,
    kind: '사냥',
    title: r.memo || (r.minutes ? `${r.minutes}분 사냥` : '사냥'),
    amount: BigInt(r.am) - BigInt(r.bm),
  }));
  const bossDays = new Map<string, { count: number; amount: bigint }>();
  for (const c of bosses.characters)
    for (const r of c.runs) {
      if (!r.cleared) continue;
      const day = bossDays.get(r.date) || { count: 0, amount: 0n };
      bossDays.set(r.date, { count: day.count + 1, amount: day.amount + settle(r).total });
    }
  for (const [date, v] of bossDays)
    items.push({ date, kind: '보스', title: `보스 ${v.count}마리 클리어`, amount: v.amount });
  return items.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)).slice(0, limit);
}
