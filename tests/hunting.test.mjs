import test from 'node:test';
import assert from 'node:assert/strict';
import { ledgerRecordSchema, saveLedgerSchema } from '../contracts/ledger/schema.ts';
import { delta, total } from '../features/hunting/model.ts';
const record = {
  id: 'one',
  date: '2026-10-25',
  bm: '9999999999999998',
  am: '9999999999999999',
  bf: '898',
  af: '900',
  memo: '',
  minutes: 60,
};
test('large meso values remain exact and fragments are calculated independently', () => {
  assert.equal(delta(record, 'm'), 1n);
  assert.equal(delta(record, 'f'), 2n);
  assert.equal(total([record, { ...record, id: 'two', bm: '200', am: '100' }], 'm'), -99n);
});
test('invalid dates, negative counts, and duplicate record ids cannot be saved', () => {
  assert.equal(ledgerRecordSchema.safeParse({ ...record, date: '2026-02-30' }).success, false);
  assert.equal(ledgerRecordSchema.safeParse({ ...record, af: '-1' }).success, false);
  assert.equal(
    saveLedgerSchema.safeParse({ revision: 1, records: [record, record] }).success,
    false,
  );
  assert.equal(saveLedgerSchema.safeParse({ revision: 1, records: [record] }).success, true);
});
