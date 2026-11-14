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
