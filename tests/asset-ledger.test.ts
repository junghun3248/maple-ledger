import test from 'node:test';
import assert from 'node:assert/strict';
import {
  dailyIncome,
  earnedBetween,
  estimateGoalDays,
  goalEarned,
  goalEarnings,
  recentNetHistory,
  type Goal,
} from '@/features/income/asset-model';
import type { LedgerRecord } from '@/contracts/ledger/request';
import type { BossState } from '@/contracts/boss/state';
import { weekKey } from '@/features/boss/model';
const row = (date: string, delta: number, id = date): LedgerRecord => ({
  id,
  date,
  bm: '1000',
  am: String(1000 + delta),
  bf: '0',
  af: '0',
  memo: '',
  minutes: 60,
});
const run = (date: string, cleared: boolean, crystal = '1000') => ({
  id: date + cleared,
  name: '스우',
  difficulty: '하드',
  period: 'week' as const,
  date,
  party: 1,
  crystal,
  fee: 500,
  cleared,
  drops: [],
});
const bosses = (...runs: ReturnType<typeof run>[]): BossState => ({
  characters: [{ id: 'c', name: 'x', runs }],
});

test('Thursday through Wednesday is one week, including the year boundary', () => {
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
});

test('daily income adds hunting deltas and settled boss income; uncleared runs are not observed days', () => {
  const daily = dailyIncome(
    [row('2026-11-06', -200), row('2026-11-06', 500, 'b')],
    bosses(run('2026-11-06', true), run('2026-11-07', false)),
  );
  assert.equal(daily.get('2026-11-06'), 1300n);
  assert.equal(daily.has('2026-11-07'), false);
});

test('future-dated records do not count toward current goal progress', () => {
  const records = [row('2026-11-10', 100), row('2026-11-20', 9999)];
  const b = bosses(run('2026-11-21', true));
  assert.equal(goalEarned({ startDate: '2026-11-01' }, records, b, '2026-11-14'), 100n);
  assert.equal(earnedBetween(dailyIncome(records, b), null, '2026-11-14'), 100n);
  assert.equal(earnedBetween(dailyIncome(records, b), null, '2026-11-21'), 11099n);
});

test('shared goal earnings match per-goal calculation', () => {
  const records = [row('2026-11-01', 10), row('2026-11-05', 20), row('2026-11-09', 40)];
  const b = bosses(run('2026-11-05', true, '7'));
  const earnedFor = goalEarnings(records, b, '2026-11-09');
  for (const startDate of ['2026-10-01', '2026-11-05', '2026-11-09', undefined])
    assert.equal(earnedFor({ startDate }), goalEarned({ startDate }, records, b, '2026-11-09'));
});

test('estimate history uses the same income as goal progress, including losses', () => {
  const history = recentNetHistory(
    [row('2026-11-06', -200), row('2026-11-07', 300)],
    bosses(run('2026-11-07', true)),
    '2026-11-07',
    3,
  );
  assert.deepEqual(history.values, [-200n, 1300n]);
  assert.equal(history.observed, 2);
  assert.equal(history.enough, false);
});
