import test from 'node:test';
import assert from 'node:assert/strict';
import { goalProgress } from '../features/income/asset-model';

test('goal progress reports remaining meso and capped percent', () => {
  assert.equal(goalProgress({ amount: '1000' }, null), null);
  assert.deepEqual(goalProgress({ amount: '1000' }, 250n), {
    remaining: 750n,
    percent: 25,
    reached: false,
  });
  assert.deepEqual(goalProgress({ amount: '3' }, 1n), {
    remaining: 2n,
    percent: 33.3,
    reached: false,
  });
  assert.deepEqual(goalProgress({ amount: '1000' }, 5000n), {
    remaining: 0n,
    percent: 100,
    reached: true,
  });
  assert.equal(goalProgress({ amount: '1000' }, -50n)?.percent, 0);
});

test('goal base uses recorded income, plus the entered balance when set', async () => {
  const { goalBase, emptyAssets } = await import('../features/income/asset-model');
  const records = [
    { id: 'a', date: '2026-11-01', bm: '100', am: '400', bf: '0', af: '0', memo: '', minutes: 0 },
    { id: 'b', date: '2026-11-10', bm: '400', am: '900', bf: '0', af: '0', memo: '', minutes: 0 },
  ];
  const bosses = {
    characters: [
      {
        id: 'c',
        name: 'x',
        runs: [
          {
            id: 'r',
            name: '스우',
            difficulty: '하드',
            period: 'week' as const,
            date: '2026-11-12',
            party: 1,
            crystal: '1000',
            fee: 500,
            cleared: true,
            drops: [],
          },
        ],
      },
    ],
  };
  assert.deepEqual(goalBase(records, bosses, emptyAssets()), { value: 1800n, kind: 'earned' });
  const withOpening = {
    ...emptyAssets(),
    opening: { amount: '5000', at: '2026-11-05T00:00:00+09:00', legacyDateChoice: null },
  };
  assert.deepEqual(goalBase(records, bosses, withOpening), { value: 6500n, kind: 'balance' });
});
