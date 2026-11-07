import assert from 'node:assert/strict';
import test from 'node:test';
import { dropSchema } from '../contracts/boss/schema';
test('stored loot accepts box and legacy icons, rejects external paths', () => {
  const drop = { id: 'box', name: 'box', selected: true, qty: 1, price: '1000' };
  for (const icon of ['/boss-icons/dark-box.png', '/boss-icons/item-38.png', '']) {
    assert.equal(dropSchema.safeParse({ ...drop, icon }).success, true);
  }
  for (const icon of ['https://example.com/icon.png', '/boss-icons/../secret.png']) {
    assert.equal(dropSchema.safeParse({ ...drop, icon }).success, false);
  }
});
