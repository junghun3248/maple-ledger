import test from 'node:test';
import assert from 'node:assert/strict';
import { boardMarkup, boardRuns, characterChoices } from '../public/boss-board.js';
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
  const html = boardMarkup(characters, '2026-10-30', 'week', null);
  assert.match(html, /5,000만/);
  assert.match(html, /data-owner="one"/);
  assert.match(html, /&lt;두번째&gt;/);
});
test('character filtering only affects the view and escapes labels', () => {
  assert.equal(boardMarkup(characters, '2026-10-30', 'week', new Set()), '');
  assert.doesNotMatch(boardMarkup(characters, '2026-10-30', 'week', new Set(['one'])), /두번째/);
  assert.match(characterChoices(characters, new Set(['two'])), /value="two" checked/);
  assert.equal(characters.length, 2);
});
