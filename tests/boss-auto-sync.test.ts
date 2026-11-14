import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  applySync,
  shouldAutoSync,
  syncTargets,
  AUTO_SYNC_INTERVAL_MS,
} from '../features/boss/auto-sync';
import { applyApiClear, mergeScheduler } from '../features/boss/scheduler';
import { bossStateSchema } from '../contracts/boss/schema';
import type { BossState, Run } from '../contracts/boss/state';

const catalog = JSON.parse(readFileSync(new URL('../public/bosses.json', import.meta.url), 'utf8'));
const OCID = 'a'.repeat(32);
let seq = 0;
const id = () => 'id-' + ++seq;

function run(patch: Partial<Run>): Run {
  return {
    id: id(),
    name: '스우',
    difficulty: '하드',
    period: 'week',
    date: '2026-11-13',
    party: 2,
    crystal: '100',
    fee: 500,
    cleared: false,
    drops: [],
    ...patch,
  };
}
const state = (runs: Run[]): BossState => ({
  characters: [{ id: 'c1', name: '라라', nexonId: OCID, runs }],
});
const rows = (complete: boolean, name = '스우') => [
  { name, difficulty: 'hard', cycle: 'bossWeekly', registered: true, complete },
];

test('API completion marks an existing run cleared and keeps party and drops', () => {
  const before = state([
    run({ drops: [{ id: 'd', name: '칠흑', icon: '', selected: true, qty: 1, price: '5' }] }),
  ]);
  const out = applySync(before, [{ ocid: OCID, bosses: rows(true) }], catalog, '2026-11-14', id);
  const r = out.state.characters[0].runs[0];
  assert.equal(out.updated, 1);
  assert.equal(r.cleared, true);
  assert.equal(r.clearedBy, 'api');
  assert.equal(r.party, 2);
  assert.equal(r.drops.length, 1);
  assert.equal(before.characters[0].runs[0].cleared, false, 'input is not mutated');
});

test('manual clear status is never overwritten by API', () => {
  const manualOff = state([run({ cleared: false, clearedBy: 'manual' })]);
  assert.equal(
    applySync(manualOff, [{ ocid: OCID, bosses: rows(true) }], catalog, '2026-11-14', id).state
      .characters[0].runs[0].cleared,
    false,
  );
  const manualOn = state([run({ cleared: true, clearedBy: 'manual' })]);
  assert.equal(
    applySync(manualOn, [{ ocid: OCID, bosses: rows(false) }], catalog, '2026-11-14', id).state
      .characters[0].runs[0].cleared,
    true,
  );
});

test('API follows the scheduler for runs not set manually', () => {
  const r = run({ cleared: true });
  assert.equal(applyApiClear(r, false), true);
  assert.equal(r.cleared, false);
  assert.equal(applyApiClear(r, undefined), false, 'unknown status changes nothing');
});

test('failed lookups leave the character untouched and are reported', () => {
  const before = state([run({})]);
  const out = applySync(before, [{ ocid: OCID, error: '한도 초과' }], catalog, '2026-11-14', id);
  assert.deepEqual(out.state, before);
  assert.deepEqual(out.failed, ['라라']);
});

test('a new week with no runs gets registered scheduler bosses, previous week kept', () => {
  const before = state([run({ cleared: true, date: '2026-11-11' })]);
  const out = applySync(before, [{ ocid: OCID, bosses: rows(true) }], catalog, '2026-11-13', id);
  const runs = out.state.characters[0].runs;
  assert.equal(out.added, 1);
  assert.equal(runs.length, 2);
  assert.equal(runs[0].date, '2026-11-11');
  assert.equal(runs[1].date, '2026-11-13');
  assert.equal(runs[1].party, 2, 'party carried over from last record');
  assert.equal(runs[1].cleared, true);
});

test('an edited week is not extended with bosses the user removed', () => {
  const before = state([run({ name: '루시드', difficulty: '하드' })]);
  const out = applySync(before, [{ ocid: OCID, bosses: rows(true) }], catalog, '2026-11-14', id);
  assert.equal(out.added, 0);
  assert.equal(out.state.characters[0].runs.length, 1);
});

test('characters without nexonId are skipped; targets are unique', () => {
  const s: BossState = {
    characters: [
      { id: 'a', name: 'A', nexonId: OCID, runs: [] },
      { id: 'b', name: 'B', runs: [] },
      { id: 'c', name: 'C', nexonId: OCID, runs: [] },
    ],
  };
  assert.deepEqual(syncTargets(s), [OCID]);
});

test('auto sync throttle', () => {
  assert.equal(shouldAutoSync(null, 0), true);
  assert.equal(shouldAutoSync(1000, 1000 + AUTO_SYNC_INTERVAL_MS - 1), false);
  assert.equal(shouldAutoSync(1000, 1000 + AUTO_SYNC_INTERVAL_MS), true);
});

test('saved data without clearedBy still parses and round-trips', () => {
  const legacy = { characters: [{ id: 'c', name: 'x', runs: [run({ cleared: true })] }] };
  const parsed = bossStateSchema.parse(JSON.parse(JSON.stringify(legacy)));
  assert.deepEqual(parsed, legacy);
  const withSource = state([run({ clearedBy: 'manual' })]);
  assert.equal(bossStateSchema.parse(withSource).characters[0].runs[0].clearedBy, 'manual');
  assert.equal(
    bossStateSchema.safeParse(state([run({ clearedBy: 'other' as 'api' })])).success,
    false,
  );
});

test('reimport keeps a manual unchecked run unchecked', () => {
  const selected = [
    {
      ...catalog.find(
        (b: { name: string; difficulty: string }) => b.name === '스우' && b.difficulty === '하드',
      ),
      complete: true,
    },
  ];
  const runs = [run({ clearedBy: 'manual' })];
  assert.equal(mergeScheduler(runs, selected, '2026-11-14', id).runs[0].cleared, false);
});
