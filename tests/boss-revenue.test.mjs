import { test } from 'node:test';
import assert from 'node:assert/strict';
import { settle, weekKey, validState } from '../features/boss/model.ts';
import { bossAction } from '../server/ledger/boss-store.ts';
const run = () => ({
  id: 'r1',
  date: '2026-10-28',
  name: '스우',
  difficulty: '하드',
  period: 'week',
  party: 6,
  fee: 500,
  crystal: '48900000',
  cleared: true,
  drops: [{ id: 'i1', name: '아이템', icon: '', price: '1000000000', qty: 1, selected: true }],
});
const state = () => ({ characters: [{ id: 'c1', name: '캐릭터', runs: [run()] }] });
test('six-person crystal and loot after 5% fee', () => {
  const r = settle(run());
  assert.equal(r.crystal, 8150000n);
  assert.equal(r.loot, 158333333n);
  assert.equal(r.total, 166483333n);
  assert.equal(r.remainder, 2n);
});
test('unobtained items are excluded; legacy clear status does not suppress registered boss income', () => {
  const r = run();
  r.drops[0].selected = false;
  assert.equal(settle(r).loot, 0n);
  r.cleared = false;
  assert.equal(settle(r).total, BigInt(r.crystal) / BigInt(r.party));
});
test('quantity, solo, no-fee, and missing price', () => {
  const r = run();
  r.party = 1;
  r.fee = 0;
  r.drops[0].qty = 2;
  assert.equal(settle(r).loot, 2000000000n);
  r.drops[0].price = '';
  assert.equal(settle(r).missing, 1);
  assert.equal(settle(r).loot, 0n);
});
test('week starts Thursday and crosses month boundaries', () => {
  assert.equal(weekKey('2026-10-28'), '2026-10-22');
  assert.equal(weekKey('2026-10-29'), '2026-10-29');
  assert.equal(weekKey('2026-11-01'), '2026-10-29');
});
test('reject invalid inputs and script URLs', () => {
  assert.equal(validState(state()), true);
  for (const bad of [
    null,
    { characters: [null] },
    { characters: [{ id: 'c', name: 'x', runs: [null] }] },
  ])
    assert.equal(validState(bad), false);
  for (const patch of [{ party: 0 }, { fee: -1 }, { date: '2026-02-30' }, { crystal: '1e10' }]) {
    const s = state();
    Object.assign(s.characters[0].runs[0], patch);
    assert.equal(validState(s), false);
  }
  const s = state();
  s.characters[0].runs[0].drops[0].icon = 'javascript:alert(1)';
  assert.equal(validState(s), false);
});
test('independent record books, revision conflicts, and round trip', async () => {
  const rows = new Map();
  const db = {
    prepare(sql) {
      return {
        bind(...args) {
          return {
            async first() {
              return rows.get(args[0]) || null;
            },
            async run() {
              if (sql.startsWith('INSERT')) {
                if (!rows.has(args[0])) rows.set(args[0], { data: args[1], revision: 0 });
                return { meta: { changes: 1 } };
              }
              const row = rows.get(args[1]);
              if (row.revision !== args[2]) return { meta: { changes: 0 } };
              row.data = args[0];
              row.revision++;
              return { meta: { changes: 1 } };
            },
          };
        },
      };
    },
  };
  assert.equal(
    (
      await bossAction(
        db,
        { id: 'A', name: 'a' },
        { action: 'boss-save', revision: 0, state: state() },
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await bossAction(
        db,
        { id: 'A', name: 'a' },
        { action: 'boss-save', revision: 0, state: state() },
      )
    ).status,
    409,
  );
  const a = await (await bossAction(db, { id: 'A', name: 'a' }, { action: 'boss-read' })).json();
  assert.equal(a.state.characters[0].runs[0].drops[0].selected, true);
  assert.equal(a.revision, 1);
  const b = await (await bossAction(db, { id: 'B', name: 'b' }, { action: 'boss-read' })).json();
  assert.deepEqual(b.state, { characters: [] });
  assert.equal(
    (
      await bossAction(
        db,
        { id: 'A', name: 'a' },
        { action: 'boss-save', revision: 1, state: { characters: [null] } },
      )
    ).status,
    400,
  );
});

import { readFileSync } from 'node:fs';
import { presets, selectionsFor, checkRoster } from '../features/boss/presets.ts';
test('12-boss presets include easy adversary and reject duplicates/overflow', () => {
  const catalog = JSON.parse(readFileSync(new URL('../public/bosses.json', import.meta.url)));
  const roster = selectionsFor(presets[0], catalog, 6);
  assert.equal(roster.length, 12);
  assert.equal(checkRoster(roster), null);
  assert.ok(roster.every((r) => r.party === 6));
  assert.ok(
    roster.some(
      (r) =>
        catalog.find((b) => b.id === r.bossId).name === '최초의 대적자' &&
        catalog.find((b) => b.id === r.bossId).difficulty === '이지',
    ),
  );
  assert.ok(checkRoster([...roster, roster[0]]));
  assert.ok(checkRoster([roster[0]], [roster[0]]));
  assert.equal(checkRoster(selectionsFor(presets[1], catalog)), null);
  const s = state();
  s.presets = [{ name: '내 구성', selection: roster }];
  assert.ok(validState(s));
});

test('crystal is fee-free for every item fee setting', () => {
  for (const fee of [0, 300, 500, 10000]) {
    const r = run();
    r.fee = fee;
    assert.equal(settle(r).crystal, 8150000n);
  }
});
test('missing high difficulties have distinct stable IDs and portraits', () => {
  const catalog = JSON.parse(readFileSync(new URL('../public/bosses.json', import.meta.url)));
  for (const [name, diff] of [
    ['감시자 칼로스', '익스트림'],
    ['카링', '익스트림'],
    ['최초의 대적자', '익스트림'],
    ['림보', '하드'],
    ['림보', '익스트림'],
    ['발드릭스', '하드'],
    ['발드릭스', '익스트림'],
    ['벨로나', '하드'],
    ['찬란한 흉성', '하드'],
    ['유피테르', '하드'],
  ])
    assert.ok(catalog.find((b) => b.name === name && b.difficulty === diff)?.icon);
  assert.equal(new Set(catalog.map((b) => b.id)).size, catalog.length);
  assert.equal(catalog.find((b) => b.id === 'boss-17').name, '스우');
});

import { dropsFor, toggleDrop } from '../features/boss/loot.ts';
import { parseRanking } from '../server/ledger/character-search.ts';
test('suggestions start unacquired, saved prices survive toggles and reload', () => {
  const items = JSON.parse(readFileSync(new URL('../public/boss-items.json', import.meta.url))),
    rules = JSON.parse(readFileSync(new URL('../public/boss-drops.json', import.meta.url))).rules;
  const r = run();
  r.drops = [];
  assert.ok(dropsFor(r, items, rules).some((d) => d.id === 'item-0' && !d.selected));
  assert.equal(r.drops.length, 0);
  assert.ok(toggleDrop(r, 'item-0', items, rules));
  r.drops[0].price = '1000000000';
  r.drops[0].qty = 2;
  assert.equal(settle(r).loot, 316666666n);
  toggleDrop(r, 'item-0', items, rules);
  assert.equal(settle(r).loot, 0n);
  toggleDrop(r, 'item-0', items, rules);
  const saved = JSON.parse(JSON.stringify(r));
  assert.equal(dropsFor(saved, items, rules).find((d) => d.id === 'item-0').price, '1000000000');
  assert.equal(saved.drops[0].qty, 2);
  r.difficulty = '노멀';
  assert.ok(!dropsFor({ ...r, drops: [] }, items, rules).some((d) => d.id === 'item-0'));
  assert.ok(
    dropsFor({ ...r, drops: [], name: '최초의 대적자', difficulty: '이지' }, items, rules).every(
      (d) => d.id !== 'item-13',
    ),
  );
});
test('ranking parser only returns exact nickname and validates profile URLs', () => {
  const html =
    '<img src="https://ssl.nexon.com/world_icon/icon_9.png" alt="엘리시움"><table><tr><td><img src="https://avatar.maplestory.nexon.com/CharacterEx/example.png"><dt><a><img src="https://ssl.nexon.com/world_icon/icon_9.png" alt="">테스트용사</a></dt><dd>히어로</dd></td><td>Lv.280</td></tr></table>';
  const c = parseRanking(html, '테스트용사');
  assert.equal(c.profile.world, '엘리시움');
  assert.equal(c.profile.level, 280);
  assert.equal(parseRanking(html, '다른용사'), null);
  const s = state();
  s.characters[0].profile = c.profile;
  assert.ok(validState(s));
  s.characters[0].profile.image = 'javascript:alert(1)';
  assert.equal(validState(s), false);
});
