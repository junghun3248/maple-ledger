import test from 'node:test';
import assert from 'node:assert/strict';
import { estimateBossSeconds, lineupTime, durationText } from '../features/boss/model';
import { incomeSeries } from '../features/income/model';
import { bossStateSchema } from '../contracts/boss/schema';
const run = {
  id: 'r',
  name: '테스트',
  difficulty: '하드',
  period: 'week' as const,
  date: '2026-11-02',
  party: 2,
  crystal: '1000',
  fee: 500,
  cleared: true,
  drops: [],
  soloRatio: 70,
  ratioMinutes: 20,
};
test('70 percent with two equal party members gives 140 percent time estimate', () => {
  assert.equal(estimateBossSeconds(run), 858);
  assert.equal(durationText(858), '14분 18초');
  const saved = bossStateSchema.parse(
    JSON.parse(JSON.stringify({ characters: [{ id: 'c', name: '테스트', runs: [run] }] })),
  );
  assert.equal(saved.characters[0].runs[0].soloRatio, 70);
  assert.equal(saved.characters[0].runs[0].ratioMinutes, 20);
  assert.equal(estimateBossSeconds({ ...run, party: 1 }), 1715);
  assert.equal(estimateBossSeconds({ ...run, soloRatio: undefined }), null);
  assert.deepEqual(lineupTime([run, { ...run, id: 'other', soloRatio: undefined }]), {
    seconds: 858,
    missing: 1,
  });
});
test('income carries prior totals, fills empty dates and recalculates edits without duplication', () => {
  const records = [
    {
      id: 'h',
      date: '2026-11-01',
      bm: '100',
      am: '400',
      bf: '0',
      af: '0',
      memo: '',
      minutes: null,
    },
    {
      id: 'h2',
      date: '2026-11-03',
      bm: '400',
      am: '350',
      bf: '0',
      af: '0',
      memo: '',
      minutes: null,
    },
  ];
  const bosses = { characters: [{ id: 'c', name: '테스트', runs: [run] }] };
  const rows = incomeSeries(records, bosses, '2026-11-02', '2026-11-04');
  assert.deepEqual(
    rows.map((r) => r.total),
    [800n, 750n, 750n],
  );
  assert.equal(rows[0].dailyBoss, 500n);
  assert.equal(
    incomeSeries(records, { characters: [] }, '2026-11-02', '2026-11-04').at(-1)?.total,
    250n,
  );
});
test('optional boss ratios preserve legacy records and reject invalid persisted ratios', () => {
  assert.equal(
    bossStateSchema.safeParse({ characters: [{ id: 'c', name: '테스트', runs: [run] }] }).success,
    true,
  );
  assert.equal(
    bossStateSchema.safeParse({
      characters: [{ id: 'c', name: '테스트', runs: [{ ...run, soloRatio: 0 }] }],
    }).success,
    false,
  );
});
