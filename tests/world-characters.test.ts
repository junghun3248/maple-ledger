import test from 'node:test';
import assert from 'node:assert/strict';
import { loadWorldCharacters } from '../features/boss/world-characters';
const character = (ocid: string, world: string) => ({
  ocid,
  world,
  name: ocid,
  job: 'test',
  level: 280,
});
const control = { active: () => true, progress: () => {} };
test('only chosen world triggers power requests, in batches of eight', async () => {
  const roster = [
    ...Array.from({ length: 9 }, (_, i) => character('a' + i, 'A')),
    character('b', 'B'),
  ];
  const calls: string[][] = [];
  const result = await loadWorldCharacters(
    roster,
    'A',
    'test-key',
    control,
    async (action, data) => {
      assert.equal(action, 'nexon-powers');
      const ids = data?.ocids as string[];
      calls.push(ids);
      return { results: ids.map((ocid) => ({ ocid, combatPower: 10000001 })) };
    },
  );
  assert.deepEqual(
    calls.map((c) => c.length),
    [8, 1],
  );
  assert.ok(calls.flat().every((id) => id.startsWith('a')));
  assert.equal(result.qualified.length, 9);
});
test('empty world never queries; exactly ten million stays excluded', async () => {
  const roster = [character('a', 'A'), character('b', 'A'), character('c', 'A')];
  let emptyCalls = 0;
  await loadWorldCharacters(roster, '', 'test-key', control, async () => {
    emptyCalls++;
    return { results: [] };
  });
  assert.equal(emptyCalls, 0);
  const result = await loadWorldCharacters(roster, 'A', 'test-key', control, async () => ({
    results: [
      { ocid: 'a', combatPower: 10000000 },
      { ocid: 'b', combatPower: 10000001 },
      { ocid: 'c', error: 'unavailable' },
    ],
  }));
  assert.deepEqual(
    result.qualified.map((c) => c.ocid),
    ['b'],
  );
  assert.equal(result.failed, 1);
});
test('cancelled request never starts the next batch or applies stale results', async () => {
  let active = true,
    calls = 0;
  const roster = Array.from({ length: 10 }, (_, i) => character(String(i), 'A'));
  const result = await loadWorldCharacters(
    roster,
    'A',
    'test-key',
    { ...control, active: () => active },
    async () => {
      calls++;
      active = false;
      return { results: [{ ocid: '0', combatPower: 20000000 }] };
    },
  );
  assert.equal(calls, 1);
  assert.equal(result.qualified.length, 0);
});
