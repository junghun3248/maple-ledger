import test from 'node:test';
import assert from 'node:assert/strict';
import { boardRuns, visibleCharacters, sumRuns } from '../features/boss/model.ts';
const run = {
  id: 'run',
  name: '스우',
  difficulty: '하드',
  date: '2026-10-30',
  period: 'week',
  crystal: '100000000',
  party: 2,
  fee: 500,
  cleared: false,
  drops: [],
};
const characters = [
  { id: 'one', name: '첫 캐릭터', runs: [run] },
  { id: 'two', name: '<두번째>', runs: [{ ...run, id: 'month', period: 'month' }] },
];
test('board separates weekly and monthly runs without hiding legacy unchecked income', () => {
  assert.equal(boardRuns(characters[0], '2026-11-01').length, 1);
  assert.equal(boardRuns(characters[1], '2026-10-30').length, 0);
  assert.equal(boardRuns(characters[1], '2026-10-30', 'month').length, 1);
  assert.equal(boardRuns(characters[0], '2026-11-05').length, 0);
  assert.equal(sumRuns(boardRuns(characters[0], '2026-10-30')), 50000000n);
});
test('character filtering only affects the view and never removes records', () => {
  assert.deepEqual(visibleCharacters(characters, []), []);
  assert.equal(visibleCharacters(characters, ['one']).length, 1);
  assert.equal(visibleCharacters(characters, null).length, 2);
  assert.equal(characters.length, 2);
});
