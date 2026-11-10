import test from 'node:test';
import assert from 'node:assert/strict';
import {
  balanceWithBoss,
  closestGoal,
  deriveSaleSources,
  emptyAssets,
  estimateGoalDays,
  includedHunt,
  ledgerBalance,
  recentBalanceRows,
  summarizeWeek,
  type Goal,
} from '@/features/income/asset-model';
import type { LedgerRecord } from '@/contracts/ledger/request';
import type { BossState } from '@/contracts/boss/state';
import { weekKey } from '@/features/boss/model';
const row = (date: string, delta: number, id = 'r'): LedgerRecord => ({
  id,
  date,
  bm: '1000',
  am: String(1000 + delta),
  bf: '0',
  af: '0',
  memo: '',
  minutes: 60,
});
const opening = {
  amount: '10000',
  at: '2026-11-05T12:00:00.000Z',
  legacyDateChoice: null as 'include' | 'exclude' | null,
};
const bosses: BossState = { characters: [] };
test('opening balance is unknown until configured; date-only record on baseline date requires explicit choice', () => {
  assert.equal(ledgerBalance([row('2026-11-05', 500)], emptyAssets()), null);
  assert.equal(includedHunt(row('2026-11-05', 500), { ...opening, legacyDateChoice: null }), false);
  assert.equal(
    includedHunt(row('2026-11-05', 500), { ...opening, legacyDateChoice: 'exclude' }),
    false,
  );
  assert.equal(
    includedHunt(row('2026-11-05', 500), { ...opening, legacyDateChoice: 'include' }),
    true,
  );
});
test('baseline excludes prior days, includes later hunt delta and excludes linked expense from a second debit', () => {
  const state = {
    ...emptyAssets(),
    opening,
    expenses: [
      {
        id: 'e',
        amount: '300',
        date: '2026-11-06',
        category: 'equipment' as const,
        memo: '',
        huntIncluded: true,
      },
      {
        id: 'e2',
        amount: '200',
        date: '2026-11-06',
        category: 'other' as const,
        memo: '',
        huntIncluded: false,
      },
    ],
  };
  assert.equal(ledgerBalance([row('2026-11-04', 900), row('2026-11-06', 1000)], state), 10800n);
  const edited = { ...state, expenses: state.expenses.filter((e) => e.id !== 'e2') };
  assert.equal(ledgerBalance([row('2026-11-04', 900), row('2026-11-06', 1000)], edited), 11000n);
});
test('only sale-confirmed proceeds increase current balance; pending legacy drop remains flagged', () => {
  const run = {
    id: 'run',
    name: '보스',
    difficulty: '하드',
    date: '2026-11-06',
    period: 'week' as const,
    cleared: true,
    crystal: '1000',
    party: 2,
    fee: 500,
    drops: [{ id: 'drop', name: '아이템', icon: '', selected: true, qty: 1, price: '2000' }],
  };
  const state: BossState = { characters: [{ id: 'char', name: '캐릭터', runs: [run] }] };
  const pending = deriveSaleSources(state, [])[0];
  assert.equal(pending.pending, true);
  assert.equal(pending.estimated, '950');
  assert.equal(
    balanceWithBoss(ledgerBalance([], { ...emptyAssets(), opening })!, state, opening),
    10500n,
  );
  const sold = {
    ...emptyAssets(),
    opening,
    sales: [
      {
        id: 'sale',
        sourceId: pending.sourceId,
        itemName: '아이템',
        proceeds: '700',
        date: '2026-11-06',
        memo: '',
      },
    ],
  };
  assert.equal(ledgerBalance([], sold)! + 500n, 11200n); // sold net only; cleared crystal is applied separately by balanceWithBoss
});
test('Thursday through Wednesday is one week, including the year boundary', () => {
  const records = [row('2026-11-05', 500), row('2026-11-04', 800)];
  const summary = summarizeWeek(
    records,
    bosses,
    { ...emptyAssets(), opening: { ...opening, legacyDateChoice: 'include' } },
    '2026-11-05',
  );
  assert.equal(summary.income, 500n);
  assert.equal(summary.incomeRecorded, true);
  assert.equal(summary.expenseRecorded, false);
  assert.equal(summarizeWeek([], bosses, emptyAssets(), '2026-11-05').incomeRecorded, false);
  assert.equal(weekKey('2026-12-31'), '2026-12-31');
  assert.equal(weekKey('2027-01-06'), '2026-12-31');
  assert.equal(weekKey('2027-01-07'), '2027-01-07');
});
test('goal days are estimates only with enough positive recorded net and precise big integers', () => {
  const goal: Goal = {
    id: 'g',
    name: '목표',
    amount: '100000000000',
    memo: '',
    priority: 1,
    active: true,
    completed: false,
  };
  assert.equal(estimateGoalDays(goal, 0n, [100n, 100n], false), null);
  assert.equal(estimateGoalDays(goal, 0n, [-20n], true), null);
  assert.equal(estimateGoalDays(goal, 99999999900n, [50n, 50n], true), 2);
  const farther = { ...goal, id: 'far', amount: '200000000000', priority: 0 };
  assert.equal(closestGoal([farther, goal], 100n)?.id, 'g');
});
test('balance trend carries a known baseline forward, while pre-baseline dates are unknown', () => {
  const assets = { ...emptyAssets(), opening };
  const rows = recentBalanceRows([row('2026-11-06', 200)], bosses, assets, '2026-11-06', 3);
  assert.deepEqual(
    rows.map((r) => r.known),
    [false, true, true],
  );
  assert.deepEqual(
    rows.map((r) => r.balance),
    [null, 10000n, 10200n],
  );
});

test('reconciliation stores and applies the explicit difference once, without classifying it as income or expense', () => {
  const adjustment = {
    id: 'adjust-1',
    before: '10800',
    after: '12000',
    delta: '1200',
    reason: '게임 잔액 확인',
    at: '2026-11-06T12:00:00.000Z',
  };
  const assets = {
    ...emptyAssets(),
    opening,
    adjustments: [adjustment],
    expenses: [
      {
        id: 'expense',
        amount: '200',
        date: '2026-11-06',
        category: 'other' as const,
        memo: '',
        huntIncluded: false,
      },
    ],
  };
  assert.equal(ledgerBalance([row('2026-11-06', 1000)], assets), 12000n);
  assert.equal(
    summarizeWeek([row('2026-11-06', 1000)], bosses, assets, '2026-11-06').expense,
    200n,
  );
});

test('KST midnight reconciliation is applied on its Korean calendar day', () => {
  const assets = {
    ...emptyAssets(),
    opening: { ...opening, amount: '1000', at: '2026-11-06T14:59:00.000Z' },
    adjustments: [
      {
        id: 'a',
        before: '1000',
        after: '1050',
        delta: '50',
        reason: '확인',
        at: '2026-11-06T15:05:00.000Z',
      },
    ],
  };
  const rows = recentBalanceRows([], bosses, assets, '2026-11-07', 2);
  assert.deepEqual(
    rows.map((r) => r.balance),
    [1000n, 1050n],
  );
});

test('losses appear in net even without an opening balance; uncleared plans are not income', () => {
  const state = emptyAssets();
  const summary = summarizeWeek([row('2026-11-06', -200)], bosses, state, '2026-11-06');
  assert.equal(summary.income, 0n);
  assert.equal(summary.expense, 200n);
  assert.equal(summary.net, -200n);
  assert.equal(summary.expenseRecorded, true);
});

test('new same-day expenses are included after baseline even when old records are excluded', () => {
  const state = {
    ...emptyAssets(),
    opening: { ...opening, legacyDateChoice: 'exclude' as const },
    expenses: [
      {
        id: 'e',
        amount: '200',
        date: '2026-11-05',
        category: 'other' as const,
        memo: '',
        huntIncluded: false,
        createdAt: '2026-11-05T13:00:00Z',
      },
    ],
  };
  assert.equal(ledgerBalance([], state), 9800n);
  assert.equal(recentBalanceRows([], bosses, state, '2026-11-05', 1)[0].balance, 9800n);
});

test('old baseline does not require walking every day; timezone offsets compare timestamps', () => {
  const state = {
    ...emptyAssets(),
    opening: { ...opening, at: '2000-01-01T00:00:00Z' },
    adjustments: [
      {
        id: 'a',
        before: '10000',
        after: '10050',
        delta: '50',
        reason: '확인',
        at: '2000-01-01T09:30:00+09:00',
      },
    ],
  };
  assert.equal(ledgerBalance([], state), 10050n);
  assert.deepEqual(
    recentBalanceRows([], bosses, state, '2026-11-07', 3).map((r) => r.balance),
    [10050n, 10050n, 10050n],
  );
});
