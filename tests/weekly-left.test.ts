import test from 'node:test';
import assert from 'node:assert/strict';
import { isResetEve, weeklyLeft } from '@/features/boss/weekly-left';
import type { BossState } from '@/contracts/boss/state';

const run = (name: string, difficulty: string, date: string, cleared: boolean, party = 1) => ({
  id: name + difficulty + date,
  name,
  difficulty,
  period: 'week' as const,
  date,
  party,
  crystal: '1000000000',
  fee: 500,
  cleared,
  drops: [],
});
const items = [
  { id: 'item-0', name: '마크', icon: '/boss-icons/item-0.png' },
  { id: 'item-1', name: '안대', icon: '/boss-icons/item-1.png' },
  { id: 'item-8', name: '기타', icon: '/boss-icons/item-8.png' },
  { id: 'item-18', name: '1단계 소울 에테르', icon: '/boss-icons/item-18.png' },
];
const rules = {
  '스우|하드': ['item-0'],
  '데미안|하드': ['item-1'],
  '스우|익스트림': ['item-0', 'item-8'],
};

test('only Wednesday (KST date) is the weekly reset eve', () => {
  assert.equal(isResetEve('2026-11-18'), true);
  assert.equal(isResetEve('2026-11-19'), false);
  assert.equal(isResetEve('2026-11-15'), false);
});

test('lists this week uncleared bosses with per-person crystal and possible drops', () => {
  const state: BossState = {
    characters: [
      {
        id: 'a',
        name: '본캐',
        runs: [
          run('스우', '하드', '2026-11-13', false, 2),
          run('데미안', '하드', '2026-11-13', true),
          run('스우', '익스트림', '2026-11-06', false), // 지난주
        ],
      },
      { id: 'b', name: '부캐', runs: [run('스우', '하드', '2026-11-12', false)] },
    ],
  };
  const left = weeklyLeft(state, '2026-11-18', items, rules);
  assert.deepEqual(
    left.bosses.map((b) => [b.character, b.name, b.crystal]),
    [
      ['본캐', '스우', 500000000n],
      ['부캐', '스우', 1000000000n],
    ],
  );
  assert.equal(left.crystal, 1500000000n);
  assert.deepEqual(
    left.drops.map((d) => [d.id, d.from]),
    [['item-0', ['하드 스우']]],
  );
});
