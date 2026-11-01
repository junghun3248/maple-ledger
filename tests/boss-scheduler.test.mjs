import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { schedulerSelection, mergeScheduler } from '../features/boss/scheduler.ts';
import { BOX_ID, toggleBoxReward, toggleDrop } from '../features/boss/loot.ts';
import { settle, validState } from '../features/boss/model.ts';
import { nexonAction } from '../server/ledger/nexon.ts';
const catalog = JSON.parse(readFileSync(new URL('../public/bosses.json', import.meta.url)));
const items = JSON.parse(readFileSync(new URL('../public/boss-items.json', import.meta.url)));
test('scheduler only imports registered weekly bosses with known difficulty', () => {
  const rows = [
    { name: '스우', difficulty: 'extreme', registered: true, cycle: 'bossWeekly' },
    { name: '데미안', difficulty: 'hard', registered: false, cycle: 'bossWeekly' },
    { name: '매그너스', difficulty: 'hard', registered: true, cycle: 'bossDaily' },
    { name: '미등록 보스', difficulty: 'normal', registered: true, cycle: 'bossWeekly' },
  ];
  const out = schedulerSelection(rows, catalog);
  assert.equal(out.selected.length, 1);
  assert.equal(out.selected[0].difficulty, '익스트림');
  assert.equal(out.unknown.length, 1);
});
test('reimport preserves party, drops, price, date and avoids duplicate weekly income', () => {
  const selected = [catalog.find((b) => b.name === '스우' && b.difficulty === '하드')];
  const first = mergeScheduler([], selected, '2026-10-29', () => 'r1');
  first.runs[0].party = 3;
  first.runs[0].drops = [
    { id: 'item-0', name: '기존 칠흑', icon: '', price: '1000000000', qty: 1, selected: true },
  ];
  first.runs[0].cleared = true;
  assert.deepEqual(
    mergeScheduler(first.runs, selected, '2026-10-30', () => 'unused').runs,
    first.runs,
  );
  const next = mergeScheduler(first.runs, selected, '2026-11-05', () => 'r2');
  assert.equal(next.runs.length, 2);
  assert.equal(next.runs[1].party, 3);
  assert.equal(next.runs[1].cleared, false);
  assert.equal(next.runs[1].drops.length, 0);
  assert.ok(validState({ characters: [{ id: 'c', name: '테스트', runs: next.runs }] }));
});
test('box results count once, separate from direct drops, prices survive toggling', () => {
  const r = {
    ...mergeScheduler([], [catalog[0]], '2026-10-29', () => 'r').runs[0],
    cleared: true,
    party: 2,
  };
  assert.equal(toggleDrop(r, BOX_ID, items, {}), false);
  toggleBoxReward(r, 'item-0', items);
  r.drops[0].price = '1000000000';
  assert.equal(settle(r).loot, 475000000n);
  toggleBoxReward(r, 'item-0', items);
  assert.equal(settle(r).loot, 0n);
  toggleBoxReward(r, 'item-0', items);
  assert.equal(settle(r).loot, 475000000n);
  assert.equal(r.drops[0].id, 'box-item-0');
  assert.ok(!items.some((i) => ['item-10', 'item-17', 'item-30', 'item-37'].includes(i.id)));
});
test('nexon proxy sends key only in official API header and returns no key', async () => {
  const old = globalThis.fetch;
  let captured;
  globalThis.fetch = async (url, opts) => {
    captured = { url, opts };
    return Response.json({
      date: '2026-10-29T00:00+09:00',
      character_name: '테스트',
      world_name: '루나',
      boss_contents: [
        {
          content_name: '스우',
          difficulty: 'hard',
          cycle: 'bossWeekly',
          registration_flag: 'true',
          complete_flag: 'false',
        },
      ],
    });
  };
  try {
    const key = 'test_key_'.repeat(8),
      res = await nexonAction({ action: 'nexon-scheduler', apiKey: key, ocid: 'a'.repeat(32) });
    const data = await res.json();
    assert.equal(data.bosses[0].registered, true);
    assert.equal(data.bosses[0].complete, false);
    assert.ok(captured.url.startsWith('https://open.api.nexon.com/'));
    assert.equal(captured.opts.headers['x-nxopen-api-key'], key);
    assert.ok(!JSON.stringify(data).includes(key));
  } finally {
    globalThis.fetch = old;
  }
});

test('scheduler completion is imported and refreshed without changing loot or revenue', () => {
  const rows = [
    { name: '스우', difficulty: 'hard', registered: true, cycle: 'bossWeekly', complete: true },
  ];
  const selection = schedulerSelection(rows, catalog).selected;
  const first = mergeScheduler([], selection, '2026-10-29', () => 'r');
  assert.equal(first.runs[0].cleared, true);
  first.runs[0].party = 3;
  first.runs[0].drops = [
    { id: 'item-0', name: '테스트', icon: '', price: '1000000000', qty: 1, selected: true },
  ];
  const total = settle(first.runs[0]).total;
  const second = mergeScheduler(
    first.runs,
    [{ ...selection[0], complete: false }],
    '2026-10-30',
    () => 'unused',
  );
  assert.equal(second.runs[0].cleared, false);
  assert.deepEqual(second.runs[0].drops, first.runs[0].drops);
  assert.equal(second.runs[0].party, 3);
  assert.equal(settle(second.runs[0]).total, total);
});
