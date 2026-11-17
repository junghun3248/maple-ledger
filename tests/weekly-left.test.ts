import test from 'node:test';
import assert from 'node:assert/strict';
import { hasEpicBeam, isResetEve, weeklyLeft } from '@/features/boss/weekly-left';
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
  { id: 'item-22', name: '생명의 연마석', icon: '/boss-icons/item-22.png' },
];
const rules = {
  '스우|하드': ['item-0'],
  '데미안|하드': ['item-1'],
  '스우|익스트림': ['item-0', 'item-8'],
  '최초의 대적자|노멀': ['item-22', 'item-18'],
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

test('only items with an epic beam are listed', () => {
  assert.deepEqual(
    [
      '1단계 소울 에테르',
      '3단계 소울 에테르',
      '4단계 소울 에테르',
      '파풀라투스 마크',
      '생명의 연마석',
      '칠흑 상자',
    ].map(hasEpicBeam),
    [false, false, true, false, true, true],
  );
  const left = weeklyLeft(
    {
      characters: [
        { id: 'a', name: '본캐', runs: [run('최초의 대적자', '노멀', '2026-11-13', false)] },
      ],
    },
    '2026-11-18',
    items,
    rules,
  );
  assert.deepEqual(
    left.drops.map((d) => d.id),
    ['item-22'],
  );
});

test('shows at most three of the rarest epic beam drops', () => {
  const names = ['생명의 연마석', '마도서', '창세의 뱃지', '칠흑 상자', '황홀한 악몽'];
  const many = names.map((name, i) => ({ id: 'r' + i, name, icon: '/boss-icons/r.png' }));
  const left = weeklyLeft(
    {
      characters: [
        { id: 'a', name: '본캐', runs: [run('검은 마법사', '하드', '2026-11-13', false)] },
      ],
    },
    '2026-11-18',
    many,
    { '검은 마법사|하드': many.map((item) => item.id) },
  );
  assert.deepEqual(
    left.drops.map((d) => d.name),
    ['황홀한 악몽', '창세의 뱃지', '마도서'],
  );
});
