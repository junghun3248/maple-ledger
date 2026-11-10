import test from 'node:test';
import assert from 'node:assert/strict';
import { assetSchema } from '@/contracts/ledger/finance-schema';
import { emptyAssets } from '@/features/income/asset-model';
const expense = {
  id: 'e',
  amount: '100',
  date: '2026-11-10',
  category: 'other',
  memo: '',
  huntIncluded: false,
};
test('finance contract rejects duplicate IDs, invalid days and zero goals', () => {
  assert.equal(
    assetSchema.safeParse({ ...emptyAssets(), expenses: [expense, expense] }).success,
    false,
  );
  assert.equal(
    assetSchema.safeParse({ ...emptyAssets(), expenses: [{ ...expense, date: '2026-02-30' }] })
      .success,
    false,
  );
  assert.equal(
    assetSchema.safeParse({
      ...emptyAssets(),
      goals: [
        {
          id: 'g',
          name: 'goal',
          amount: '0',
          memo: '',
          priority: 0,
          active: true,
          completed: false,
        },
      ],
    }).success,
    false,
  );
});
test('finance contract accepts negative previous balance but enforces exact adjustment delta', () => {
  const adjustment = {
    id: 'a',
    before: '-100',
    after: '500',
    delta: '600',
    reason: '확인',
    at: '2026-11-10T00:00:00Z',
  };
  assert.equal(
    assetSchema.safeParse({ ...emptyAssets(), adjustments: [adjustment] }).success,
    true,
  );
  assert.equal(
    assetSchema.safeParse({ ...emptyAssets(), adjustments: [{ ...adjustment, delta: '500' }] })
      .success,
    false,
  );
});
test('the same loot cannot be sold twice under different receipt ids', () => {
  const sale = {
    id: 'a',
    sourceId: 'character:run:drop',
    itemName: 'item',
    proceeds: '100',
    date: '2026-11-10',
    memo: '',
  };
  assert.equal(
    assetSchema.safeParse({ ...emptyAssets(), sales: [sale, { ...sale, id: 'b' }] }).success,
    false,
  );
});
