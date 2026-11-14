import type { LedgerRecord } from '@/contracts/ledger/request';
import type { BossState } from '@/contracts/boss/state';
import { settle, weekKey } from '@/features/boss/model';
import { koreaDate } from '@/lib/ledger/korea-date';

import type { AssetSettings, Goal, Sale } from '@/contracts/ledger/finance-schema';
export type { AssetSettings, ExpenseCategory, Goal, Sale } from '@/contracts/ledger/finance-schema';
export const emptyAssets = (): AssetSettings => ({
  opening: null,
  expenses: [],
  adjustments: [],
  goals: [],
  sales: [],
});
export function includedHunt(record: LedgerRecord, opening: AssetSettings['opening']) {
  if (!opening) return false;
  if (record.date < koreaDate(Date.parse(opening.at))) return false;
  if (record.date > koreaDate(Date.parse(opening.at))) return true;
  return opening.legacyDateChoice === 'include';
}
function eligibleDate(date: string, opening: AssetSettings['opening'], createdAt?: string) {
  return (
    !!opening &&
    (date > koreaDate(Date.parse(opening.at)) ||
      (date === koreaDate(Date.parse(opening.at)) &&
        (createdAt
          ? Date.parse(createdAt) >= Date.parse(opening.at)
          : opening.legacyDateChoice === 'include')))
  );
}
export function ledgerBalance(records: LedgerRecord[], assets: AssetSettings) {
  if (!assets.opening) return null;
  let v = BigInt(assets.opening.amount);
  for (const r of records) if (includedHunt(r, assets.opening)) v += BigInt(r.am) - BigInt(r.bm);
  for (const e of assets.expenses)
    if (!e.huntIncluded && eligibleDate(e.date, assets.opening, e.createdAt)) v -= BigInt(e.amount);
  for (const s of assets.sales)
    if (eligibleDate(s.date, assets.opening, s.createdAt)) v += BigInt(s.proceeds);
  for (const a of assets.adjustments)
    if (Date.parse(a.at) >= Date.parse(assets.opening.at)) v += BigInt(a.delta);
  return v;
}
export function balanceWithBoss(
  value: bigint,
  bosses: BossState,
  opening: AssetSettings['opening'],
) {
  if (!opening) return null;
  for (const c of bosses.characters)
    for (const r of c.runs)
      if (r.cleared && eligibleDate(r.date, opening)) value += settle({ ...r, drops: [] }).crystal;
  return value;
}
export function summarizeWeek(
  records: LedgerRecord[],
  bosses: BossState,
  assets: AssetSettings,
  today: string,
) {
  const entries = [...dailyCashFlow(records, bosses, assets).entries()].filter(
    ([date]) => weekKey(date) === weekKey(today) && date <= today,
  );
  const income = entries.reduce((n, [, v]) => n + v.income, 0n);
  const expense = entries.reduce((n, [, v]) => n + v.expense, 0n);
  return {
    income,
    expense,
    net: income - expense,
    incomeRecorded: entries.some(([, v]) => v.incomeRecorded),
    expenseRecorded: entries.some(([, v]) => v.expenseRecorded),
  };
}
export function dailyCashFlow(records: LedgerRecord[], bosses: BossState, assets: AssetSettings) {
  const map = new Map<
    string,
    {
      hunting: bigint;
      boss: bigint;
      income: bigint;
      expense: bigint;
      incomeRecorded: boolean;
      expenseRecorded: boolean;
    }
  >();
  const get = (date: string) => {
    if (!map.has(date))
      map.set(date, {
        hunting: 0n,
        boss: 0n,
        income: 0n,
        expense: 0n,
        incomeRecorded: false,
        expenseRecorded: false,
      });
    return map.get(date)!;
  };
  for (const r of records) {
    const v = get(r.date),
      delta = BigInt(r.am) - BigInt(r.bm);
    v.hunting += delta;
    v.incomeRecorded = true;
    if (delta >= 0n) v.income += delta;
    else {
      v.expense -= delta;
      v.expenseRecorded = true;
    }
  }
  for (const c of bosses.characters)
    for (const r of c.runs)
      if (r.cleared) {
        const v = get(r.date),
          crystal = settle({ ...r, drops: [] }).crystal;
        v.boss += crystal;
        v.income += crystal;
        v.incomeRecorded = true;
      }
  for (const s of assets.sales) {
    const v = get(s.date);
    v.boss += BigInt(s.proceeds);
    v.income += BigInt(s.proceeds);
    v.incomeRecorded = true;
  }
  for (const e of assets.expenses)
    if (!e.huntIncluded) {
      const v = get(e.date);
      v.expense += BigInt(e.amount);
      v.expenseRecorded = true;
    }
  return map;
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
export function deriveSaleSources(bosses: BossState, sales: Sale[]) {
  const sold = new Set(sales.map((s) => s.sourceId));
  return bosses.characters.flatMap((c) =>
    c.runs.flatMap((r) =>
      r.drops
        .filter((d) => d.selected)
        .map((d) => {
          const sourceId = `${c.id}:${r.id}:${d.id}`;
          return {
            sourceId,
            itemName: d.name,
            pending: !sold.has(sourceId),
            estimated: d.price
              ? (
                  (BigInt(d.price) * BigInt(d.qty) * (10000n - BigInt(r.fee))) /
                  10000n /
                  BigInt(r.party)
                ).toString()
              : null,
          };
        }),
    ),
  );
}
function dayRange(end: string, count: number) {
  const e = new Date(end + 'T12:00:00Z');
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(e);
    d.setUTCDate(d.getUTCDate() - count + 1 + i);
    return d.toISOString().slice(0, 10);
  });
}
export function recentBalanceRows(
  records: LedgerRecord[],
  bosses: BossState,
  assets: AssetSettings,
  end = koreaDate(),
  count = 7,
) {
  const dates = dayRange(end, count);
  if (!assets.opening)
    return dates.map((date) => ({ date, balance: null as bigint | null, known: false }));
  const opening = assets.opening;
  const from = koreaDate(Date.parse(opening.at));
  const changes = new Map<string, bigint>();
  const add = (date: string, delta: bigint) => changes.set(date, (changes.get(date) ?? 0n) + delta);
  for (const r of records) if (includedHunt(r, opening)) add(r.date, BigInt(r.am) - BigInt(r.bm));
  for (const c of bosses.characters)
    for (const r of c.runs)
      if (r.cleared && eligibleDate(r.date, opening))
        add(r.date, settle({ ...r, drops: [] }).crystal);
  for (const e of assets.expenses)
    if (!e.huntIncluded && eligibleDate(e.date, opening, e.createdAt))
      add(e.date, -BigInt(e.amount));
  for (const s of assets.sales)
    if (eligibleDate(s.date, opening, s.createdAt)) add(s.date, BigInt(s.proceeds));
  for (const a of assets.adjustments)
    if (Date.parse(a.at) >= Date.parse(opening.at))
      add(koreaDate(Date.parse(a.at)), BigInt(a.delta));
  let balance = BigInt(opening.amount);
  for (const [date, delta] of changes) if (date < dates[0]) balance += delta;
  return dates.map((date) => {
    if (date < from) return { date, balance: null as bigint | null, known: false };
    balance += changes.get(date) ?? 0n;
    return { date, balance, known: true };
  });
}
export function recentNetHistory(
  records: LedgerRecord[],
  bosses: BossState,
  assets: AssetSettings,
  end = koreaDate(),
  days = 28,
) {
  const flow = dailyCashFlow(records, bosses, assets);
  const observed = dayRange(end, days).flatMap((date) => {
    const v = flow.get(date);
    return v ? [v.income - v.expense] : [];
  });
  return { values: observed, enough: observed.length >= 14, observed: observed.length };
}

export function closestGoal(goals: Goal[], current: bigint | null) {
  const active = goals.filter((goal) => goal.active && !goal.completed);
  if (current === null) return active.sort((a, b) => a.priority - b.priority)[0] ?? null;
  return (
    active.sort((a, b) => {
      const leftA = BigInt(a.amount) > current ? BigInt(a.amount) - current : 0n;
      const leftB = BigInt(b.amount) > current ? BigInt(b.amount) - current : 0n;
      return leftA === leftB ? a.priority - b.priority : leftA < leftB ? -1 : 1;
    })[0] ?? null
  );
}

// 목표 진행 상태. 잔액을 모르면 null을 돌려 화면에서 추정하지 않는다.
export function goalProgress(goal: Pick<Goal, 'amount'>, current: bigint | null) {
  if (current === null) return null;
  const target = BigInt(goal.amount);
  const remaining = target > current ? target - current : 0n;
  const percent = current <= 0n ? 0 : Math.min(100, Number((current * 1000n) / target) / 10);
  return { remaining, percent, reached: remaining === 0n };
}

/**
 * 목표 진행률의 기준 금액.
 * - 보유 메소를 입력했으면: 입력값 + 그 이후 기록된 사냥 차액·보스 정산액
 * - 입력하지 않았으면: 지금까지 기록된 사냥 차액·보스 정산액 합계
 */
export function goalBase(records: LedgerRecord[], bosses: BossState, assets: AssetSettings) {
  const opening = assets.opening;
  let income = 0n;
  for (const r of records)
    if (!opening || includedHunt(r, opening)) income += BigInt(r.am) - BigInt(r.bm);
  for (const c of bosses.characters)
    for (const r of c.runs)
      if (!opening || eligibleDate(r.date, opening)) income += settle(r).total;
  return opening
    ? { value: BigInt(opening.amount) + income, kind: 'balance' as const }
    : { value: income, kind: 'earned' as const };
}

/** 목표 시작일(없으면 오늘)부터 기록된 사냥 차액·보스 정산액 합계 */
export function goalEarned(
  goal: Pick<Goal, 'startDate'>,
  records: LedgerRecord[],
  bosses: BossState,
  today = koreaDate(),
) {
  const start = goal.startDate ?? today;
  let earned = 0n;
  for (const r of records) if (r.date >= start) earned += BigInt(r.am) - BigInt(r.bm);
  for (const c of bosses.characters)
    for (const r of c.runs) if (r.date >= start) earned += settle(r).total;
  return earned;
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
