// 강화 이력 비용 계산 테스트. 정규화·비용 픽스처는 Codex의 강화 이력 지출 작업(2026-11-11)에서 옮겨 왔다.
// 실제 API 응답·키는 쓰지 않고 합성 픽스처만 쓴다.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  enhancementHistory,
  enhancementLevels,
  normalizeEnhancement,
} from '@/server/ledger/enhancement-history';
import {
  enhancementCost,
  enhancementDays,
  enhancementId,
  mergeEnhancements,
  removeEnhancementDay,
} from '@/features/income/enhancement-model';
import { dailyIncome, emptyAssets, goalEarned } from '@/features/income/asset-model';
import { incomeSeries } from '@/features/income/model';
import { assetSchema } from '@/contracts/ledger/finance-schema';

const settings = { levels: { 'test item': 200 }, mvp: 0, pc: false, huntIncluded: false };
const raw = {
  id: 'history-1',
  date_create: '2026-11-10T10:00:00+09:00',
  target_item: 'test item',
  character_name: 'fixture',
  item_level: 200,
  potential_type: '잠재능력',
  before_potential_option: [{ grade: '유니크' }, { grade: '에픽' }, { grade: '에픽' }],
  after_potential_option: [{}, {}, {}],
  potential_option_grade: '레전드리',
};
const star = {
  ...raw,
  before_starforce_count: 0,
  superior_item_flag: '0',
  destroy_defence: '0',
  upgrade_item: '',
  protect_shield: '0',
  event_field_flag: '0',
  starforce_event_list: [],
};

test('potential uses the grade before reset and supports additional and triple rolls', () => {
  assert.equal(enhancementCost(normalizeEnhancement(raw, 'potential'), settings), 38250000);
  const triple = normalizeEnhancement(
    { ...raw, after_potential_option: Array(9).fill({}) },
    'potential',
  );
  assert.equal(enhancementCost(triple, settings), 114750000);
  const additional = normalizeEnhancement(
    {
      ...raw,
      potential_type: '에디셔널 잠재능력',
      before_additional_potential_option: [{ grade: '레전드리' }],
      after_additional_potential_option: [{}, {}, {}],
    },
    'potential',
  );
  assert.equal(enhancementCost(additional, settings), 88000000);
  const unknown = normalizeEnhancement({ ...raw, before_potential_option: [] }, 'potential');
  assert.equal(enhancementCost(unknown, settings), null);
});

test('starforce needs a level, applies member discounts and skips special currencies', () => {
  const row = normalizeEnhancement(star, 'starforce');
  assert.equal(enhancementCost(row, settings), 321000);
  assert.equal(enhancementCost(row, { ...settings, levels: {} }), null);
  assert.equal(enhancementCost(row, { ...settings, mvp: 0.1, pc: true }), 272850);
  for (const extra of [{ upgrade_item: '펄스 인핸서' }, { superior_item_flag: '1' }])
    assert.equal(
      enhancementCost(normalizeEnhancement({ ...star, ...extra }, 'starforce'), settings),
      null,
    );
  const event = normalizeEnhancement(
    {
      ...star,
      starforce_event_list: [{ cost_discount_rate: '30%', starforce_event_range: '0~29' }],
    },
    'starforce',
  );
  assert.equal(enhancementCost(event, settings), 224700);
  const unclear = normalizeEnhancement(
    {
      ...star,
      starforce_event_list: [{ cost_discount_rate: 'unknown', starforce_event_range: 'all' }],
    },
    'starforce',
  );
  assert.equal(enhancementCost(unclear, settings), null);
});

test('descriptive flags, null event fields and comma ranges are supported', () => {
  const row = normalizeEnhancement(
    {
      ...star,
      superior_item_flag: '슈페리얼 장비 미해당',
      destroy_defence: '파괴 방지 미적용',
      protect_shield: '프로텍트 실드 미사용',
      event_field_flag: '필드 이벤트 미적용',
      starforce_event_list: [
        { cost_discount_rate: null, starforce_event_range: null },
        { cost_discount_rate: '30', starforce_event_range: '0,1,2' },
      ],
    },
    'starforce',
  );
  assert.equal(enhancementCost(row, settings), 224700);
  const noEvents = normalizeEnhancement({ ...star, starforce_event_list: null }, 'starforce');
  assert.equal(enhancementCost(noEvents, settings), 321000);
  const safe = normalizeEnhancement(
    { ...star, before_starforce_count: 15, destroy_defence: '파괴 방지 적용' },
    'starforce',
  );
  assert.equal(safe.safeguard, true);
  assert.equal(
    enhancementCost(safe, settings),
    enhancementCost({ ...safe, safeguard: false }, settings)! * 3,
  );
});

test('re-imports never double count; removing a day allows importing it again', async () => {
  const row = normalizeEnhancement(raw, 'potential');
  const first = await mergeEnhancements(emptyAssets(), [row, row], settings);
  assert.equal(first.added, 1);
  assert.equal(first.duplicate, 1);
  assert.equal(assetSchema.safeParse(first.finance).success, true);
  assert.equal((await mergeEnhancements(first.finance, [row], settings)).added, 0);
  const ignored = { ...emptyAssets(), ignoredEnhancements: [await enhancementId(row)] };
  assert.equal((await mergeEnhancements(ignored, [row], settings)).added, 0);
  const cleared = removeEnhancementDay(first.finance, '2026-11-10');
  assert.equal(cleared.expenses.length, 0);
  assert.equal((await mergeEnhancements(cleared, [row], settings)).added, 1);
});

test('enhancement spending is subtracted from income, goals and the chart', async () => {
  const row = normalizeEnhancement(raw, 'potential');
  const { finance } = await mergeEnhancements(emptyAssets(), [row], settings);
  const records = [
    {
      id: 'h',
      date: '2026-11-10',
      bm: '0',
      am: '100000000',
      bf: '0',
      af: '0',
      memo: '',
      minutes: 60,
    },
  ];
  const bosses = { characters: [] };
  assert.equal(dailyIncome(records, bosses, finance.expenses).get('2026-11-10'), 61750000n);
  assert.equal(
    goalEarned({ startDate: '2026-11-01' }, records, bosses, '2026-11-14', finance.expenses),
    61750000n,
  );
  const day = incomeSeries(records, bosses, '2026-11-10', '2026-11-10', finance.expenses)[0];
  assert.equal(day.dailySpend, 38250000n);
  assert.equal(day.total, 61750000n);
  assert.deepEqual(
    enhancementDays(finance.expenses).map((d) => [d.date, d.count, d.amount]),
    [['2026-11-10', 1, 38250000n]],
  );
  // 사냥 전후 메소에 이미 포함된 비용은 다시 빼지 않는다.
  const included = await mergeEnhancements(emptyAssets(), [row], {
    ...settings,
    huntIncluded: true,
  });
  assert.equal(
    dailyIncome(records, bosses, included.finance.expenses).get('2026-11-10'),
    100000000n,
  );
});

test('history endpoint validates input and never echoes the API key', async () => {
  const key = 'x'.repeat(40);
  assert.equal(
    (await enhancementHistory({ key: 'bad', date: '2026-11-10', kind: 'potential' })).status,
    400,
  );
  assert.equal(
    (await enhancementHistory({ key, date: '2026-10-01', kind: 'potential' })).status,
    400,
  );
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async (url) => {
      assert.match(String(url), /history\/potential\?count=100&date=2026-11-10/);
      return new Response(JSON.stringify({ next_cursor: 'next', potential_history: [raw] }));
    };
    const data: { rows?: unknown[]; cursor?: string; levels?: unknown } = await (
      await enhancementHistory({ key, date: '2026-11-10', kind: 'potential' })
    ).json();
    assert.equal(data.rows?.length, 1);
    assert.equal(data.cursor, 'next');
    assert.equal(JSON.stringify(data).includes(key), false);
  } finally {
    globalThis.fetch = original;
  }
});

test('equipment levels come from equipped and preset items', async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async (url) => {
      const path = String(url);
      if (path.includes('/id?')) return new Response(JSON.stringify({ ocid: 'a'.repeat(32) }));
      assert.match(path, /character\/item-equipment\?ocid=a{32}/);
      return new Response(
        JSON.stringify({
          item_equipment: [{ item_name: '무기', item_base_option: { base_equipment_level: 200 } }],
          item_equipment_preset_2: [
            { item_name: '모자', item_base_option: { base_equipment_level: 160 } },
          ],
        }),
      );
    };
    const data: { rows?: unknown[]; cursor?: string; levels?: unknown } = await (
      await enhancementLevels({ key: 'x'.repeat(40), characters: ['fixture'] })
    ).json();
    assert.deepEqual(data.levels, { 무기: 200, 모자: 160 });
  } finally {
    globalThis.fetch = original;
  }
});
