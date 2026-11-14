import type { LedgerRecord } from '@/contracts/ledger/request';
import type { BossState } from '@/contracts/boss/state';
import { settle } from '@/features/boss/model';
import { koreaDate } from '@/lib/ledger/korea-date';

import type { AssetSettings, Goal } from '@/contracts/ledger/finance-schema';
export type { AssetSettings, ExpenseCategory, Goal, Sale } from '@/contracts/ledger/finance-schema';
export const emptyAssets = (): AssetSettings => ({
  opening: null,
  expenses: [],
  adjustments: [],
  goals: [],
  sales: [],
});

/** 날짜별 수입: 사냥 차액 + 보스 정산액(결정석 + 판매 체크한 물욕템). 목표·예상 기간·홈이 같은 기준을 쓴다. */
export function dailyIncome(records: LedgerRecord[], bosses: BossState) {
  const map = new Map<string, bigint>();
  const add = (date: string, value: bigint) => map.set(date, (map.get(date) ?? 0n) + value);
  for (const r of records) add(r.date, BigInt(r.am) - BigInt(r.bm));
  for (const c of bosses.characters)
    for (const r of c.runs) {
      // 아직 잡지 않은 일정은 수입 기록이 아니므로 예상 기간의 관측일로 세지 않는다.
      const total = settle(r).total;
      if (r.cleared || total > 0n) add(r.date, total);
    }
  return map;
}

/** start(없으면 처음)부터 end까지의 수입 합계. 미래 날짜로 잘못 입력한 기록은 세지 않는다. */
export function earnedBetween(daily: Map<string, bigint>, start: string | null, end: string) {
  let earned = 0n;
  for (const [date, value] of daily)
    if ((start === null || date >= start) && date <= end) earned += value;
  return earned;
}

/** 목표 시작일(없으면 오늘)부터 오늘까지 기록된 사냥 차액·보스 정산액 합계 */
export function goalEarned(
  goal: Pick<Goal, 'startDate'>,
  records: LedgerRecord[],
  bosses: BossState,
  today = koreaDate(),
) {
  return earnedBetween(dailyIncome(records, bosses), goal.startDate ?? today, today);
}

/** 여러 목표의 진행 금액을 계산할 때 기록 전체를 한 번만 모으고 시작일별 결과를 재사용한다. */
export function goalEarnings(records: LedgerRecord[], bosses: BossState, today = koreaDate()) {
  const daily = dailyIncome(records, bosses);
  const cache = new Map<string, bigint>();
  return (goal: Pick<Goal, 'startDate'>) => {
    const start = goal.startDate ?? today;
    let earned = cache.get(start);
    if (earned === undefined) {
      earned = earnedBetween(daily, start, today);
      cache.set(start, earned);
    }
    return earned;
  };
}

export function estimateGoalDays(
  goal: Goal,
  current: bigint,
  recentNet: bigint[],
  enoughData: boolean,
) {
  if (!enoughData || !recentNet.length) return null;
  const positive = recentNet.reduce((a, b) => a + b, 0n);
  if (positive <= 0n) return null;
  const avg = positive / BigInt(recentNet.length);
  if (avg <= 0n) return null;
  const remain = BigInt(goal.amount) - current;
  return remain <= 0n ? 0 : Number((remain + avg - 1n) / avg);
}
function dayRange(end: string, count: number) {
  const e = new Date(end + 'T12:00:00Z');
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(e);
    d.setUTCDate(d.getUTCDate() - count + 1 + i);
    return d.toISOString().slice(0, 10);
  });
}
export function recentNetHistory(
  records: LedgerRecord[],
  bosses: BossState,
  end = koreaDate(),
  days = 28,
) {
  const daily = dailyIncome(records, bosses);
  const observed = dayRange(end, days).flatMap((date) => {
    const v = daily.get(date);
    return v === undefined ? [] : [v];
  });
  return { values: observed, enough: observed.length >= 14, observed: observed.length };
}

// 목표 진행 상태. 잔액을 모르면 null을 돌려 화면에서 추정하지 않는다.
export function goalProgress(goal: Pick<Goal, 'amount'>, current: bigint | null) {
  if (current === null) return null;
  const target = BigInt(goal.amount);
  const remaining = target > current ? target - current : 0n;
  const percent = current <= 0n ? 0 : Math.min(100, Number((current * 1000n) / target) / 10);
  return { remaining, percent, reached: remaining === 0n };
}

/** 진행 중인 목표 중 남은 금액이 가장 적은 목표 (같으면 우선순위 순) */
export function nextGoal(goals: Goal[], earnedFor: (goal: Goal) => bigint) {
  const left = (g: Goal) => {
    const rest = BigInt(g.amount) - earnedFor(g);
    return rest > 0n ? rest : 0n;
  };
  return (
    goals
      .filter((g) => g.active && !g.completed)
      .sort((a, b) => {
        const la = left(a),
          lb = left(b);
        return la === lb ? a.priority - b.priority : la < lb ? -1 : 1;
      })[0] ?? null
  );
}
