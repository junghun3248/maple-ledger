import test from 'node:test';
import assert from 'node:assert/strict';
import { boutique } from '../features/cash/data/boutique';
import { expectation, restorePrices, validateBox, openBoxes } from '../features/cash/model';
const prices = restorePrices(boutique, null);
test('boutique distribution totals 100% and rejects incomplete tables', () => {
  validateBox(boutique);
  assert.equal(
    boutique.items.reduce((v, i) => v + i.probability, 0),
    100,
  );
  assert.throws(() => validateBox({ ...boutique, items: boutique.items.slice(1) }));
});
test('default ticket and item prices produce the weighted expected profit', () => {
  const ev = expectation(boutique, prices);
  assert.equal(ev.cost, 25000);
  assert.ok(Math.abs(ev.value - 22914.41) < 1e-8);
  assert.ok(Math.abs(ev.net + 2085.59) < 1e-8);
  assert.equal(expectation(boutique, { ...prices, ticket: 0 }).roi, null);
});
test('1000 independent openings include last bucket and freeze opening cost', () => {
  let n = 0;
  const r = openBoxes(boutique, prices, 1000, () => (++n % 2 ? 0 : 0.9999));
  assert.equal(n, 1000);
  assert.deepEqual(
    r.drops.map((d) => d.quantity),
    [500, 500],
  );
  assert.equal(r.cost, 25000000);
  assert.equal(r.net, r.value - r.cost);
});
