import test from 'node:test';
import assert from 'node:assert/strict';
import { resetCost, upgrade, rollOptions, percentTotal } from '../features/simulator/potential';
import {
  maxStars,
  starRates,
  starRoll,
  restoreItems,
  starCost,
} from '../features/simulator/starforce';
import { parseTables } from '../server/simulator/probabilities';
test('potential price bands and additional prices', () => {
  assert.equal(resetCost('potential', 159, 4), 40000000);
  assert.equal(resetCost('potential', 160, 4), 42500000);
  assert.equal(resetCost('potential', 200, 3), 38250000);
  assert.equal(resetCost('additional', 250, 4), 98000000);
  assert.throws(() => resetCost('potential', 0, 1));
});
test('pity guarantees upgrade after the specified consecutive failures', () => {
  assert.deepEqual(
    upgrade('potential', 3, 106, false, () => 0.99),
    { grade: 3, failures: 107 },
  );
  assert.deepEqual(
    upgrade('potential', 3, 107, false, () => 0.99),
    { grade: 4, failures: 0 },
  );
  assert.deepEqual(
    upgrade('additional', 3, 214, false, () => 0.99),
    { grade: 4, failures: 0 },
  );
  assert.equal(upgrade('potential', 1, 0, true, () => 0.25).grade, 2);
});
test('restricted useful skills cannot occur twice', () => {
  const table = [
    { text: '쓸만한 스킬', weight: 90 },
    { text: 'STR : +12%', weight: 10 },
  ];
  assert.deepEqual(
    rollOptions([table, table, table], () => 0),
    ['쓸만한 스킬', 'STR : +12%', 'STR : +12%'],
  );
});
test('official table parser rejects incomplete and invalid totals', () => {
  const row = '<tr><td>STR : +12%</td><td>100%</td></tr>';
  const html = [1, 2, 3]
    .map((n) => '<table class="cube_data _' + n + '">' + row + '</table>')
    .join('');
  assert.equal(parseTables(html).length, 3);
  assert.throws(() => parseTables(html.replace('100%', '99%')));
  assert.throws(() => parseTables('<html>upstream error</html>'));
});
test('2026 starcatch adjustment and safeguard preserve probability mass', () => {
  assert.ok(Math.abs(starRates(15).success - 0.315) < 1e-10);
  assert.ok(Math.abs(starRates(15).boom - 0.02055) < 1e-10);
  assert.ok(Math.abs(starRates(17).boom - 0.0674) < 1e-10);
  for (let s = 0; s < 30; s++) {
    for (const safe of [false, true]) {
      const r = starRates(s, safe, true);
      assert.ok(r.success >= 0 && r.boom >= 0 && r.stay >= 0);
      assert.ok(Math.abs(r.success + r.boom + r.stay - 1) < 1e-10);
    }
  }
  assert.equal(starRates(17, true).boom, 0);
  assert.ok(starRates(18, true).boom > 0);
  assert.equal(starRates(15, false, false, true).success, 1);
  assert.equal(starRates(15, false, false, true).boom, 0);
});
test('starforce failure never drops and high traces cap at 22', () => {
  assert.equal(starRoll(17, false, false, false, () => 0.99).stars, 17);
  assert.deepEqual(
    starRoll(25, false, false, false, () => 0.2),
    { stars: 22, result: '파괴' },
  );
  assert.deepEqual(
    starRoll(15, false, false, false, () => 0),
    { stars: 16, result: '성공' },
  );
  assert.deepEqual([94, 95, 108, 118, 128, 138].map(maxStars), [5, 8, 10, 15, 20, 30]);
  assert.deepEqual([18, 19, 20, 21, 22].map(restoreItems), [1, 2, 2, 3, 4]);
});

test('star costs apply safeguards separately from discounts', () => {
  assert.equal(starCost(200, 0), 321000);
  const base = starCost(200, 15);
  assert.equal(starCost(200, 15, true), base * 3);
  assert.equal(starCost(200, 15, true, true), Math.floor(base * 2.7));
  assert.equal(starCost(200, 18, true), starCost(200, 18));
  assert.throws(() => starCost(130, 20));
});
test('option target sums exact percent stats, includes all-stat only for main stats', () => {
  assert.equal(percentTotal(['STR : +12%', '올스탯 : +9%', 'STR : +32'], 'STR'), 21);
  assert.equal(percentTotal(['공격력 : +12%', '마력 : +12%', '올스탯 : +9%'], '공격력'), 12);
});

test('equipment lookup validates endpoints and never returns API key', async () => {
  const { equipment } = await import('../server/simulator/equipment');
  const old = globalThis.fetch;
  const key = 'a'.repeat(64);
  const seen: string[] = [];
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    seen.push(url);
    assert.ok(url.startsWith('https://open.api.nexon.com/maplestory/v1/'));
    assert.equal(new Headers(init?.headers).get('x-nxopen-api-key'), key);
    assert.equal(init?.redirect, 'manual');
    return Response.json(
      url.includes('/id?')
        ? { ocid: '1'.repeat(32) }
        : {
            item_equipment_preset_1: [],
            item_equipment_preset_2: [
              {
                item_name: '보스 프리셋 무기',
                item_equipment_slot: '무기',
                item_equipment_part: '한손검',
                item_icon: 'https://open.api.nexon.com/static/test.png',
                item_base_option: { base_equipment_level: 200 },
                starforce: '22',
              },
            ],
            item_equipment_preset_3: null,
            item_equipment: [
              {
                item_name: '테스트 무기',
                item_equipment_slot: '무기',
                item_equipment_part: '한손검',
                item_icon: 'https://open.api.nexon.com/static/test.png',
                item_base_option: { base_equipment_level: 200 },
                starforce: '17',
                potential_option_grade: '유니크',
                additional_potential_option_grade: '에픽',
                potential_option_1: 'STR : +9%',
                potential_option_2: null,
                potential_option_3: null,
              },
            ],
          },
    );
  };
  try {
    const result = await equipment({ apiKey: key, nickname: '테스트' });
    assert.equal(seen.length, 2);
    assert.equal(result.presets[1].equipment[0].stars, 22);
    assert.equal(result.presets[1].equipment[0].name, '보스 프리셋 무기');
    assert.equal(result.presets[0].equipment.length, 0);
    assert.equal(result.presets[2].equipment.length, 0);
    assert.equal(result.equipment[0].part, 1);
    assert.equal(result.equipment[0].potentialGrade, 3);
    assert.equal(result.equipment[0].stars, 17);
    assert.ok(!JSON.stringify(result).includes(key));
  } finally {
    globalThis.fetch = old;
  }
});
