import test from 'node:test';
import assert from 'node:assert/strict';
import { coreKinds, type CoreKind } from '@/features/hexa/costs';
import {
  costBetween,
  fragmentMeso,
  kindOf,
  planTotal,
  reachableLevel,
  shortfall,
} from '@/features/hexa/model';
import { hexaCores, nexonAction } from '@/server/ledger/nexon';

// 나무위키 HEXA 매트릭스 누적 표(0→10, 0→20, 0→30)와 맞는지 확인한다. 표를 옮기며 생긴 오타를 잡는다.
const cumulative: Record<CoreKind, [number, number][]> = {
  skill: [
    [30, 680],
    [80, 2110],
    [150, 4500],
  ],
  third: [
    [27, 572],
    [64, 1641],
    [117, 3442],
  ],
  mastery: [
    [18, 342],
    [45, 1057],
    [83, 2252],
  ],
  enhance: [
    [27, 513],
    [67, 1588],
    [123, 3383],
  ],
  common: [
    [46, 903],
    [116, 2916],
    [208, 6268],
  ],
  jobCommon: [
    [28, 610],
    [74, 1886],
    [137, 4035],
  ],
};

test('cost tables match the published cumulative totals', () => {
  for (const kind of coreKinds)
    [10, 20, 30].forEach((to, i) => {
      const { sol, fragments } = costBetween(kind, 0, to);
      assert.deepEqual([sol, fragments], cumulative[kind][i], `${kind} 0→${to}`);
    });
  // 마스터리 28→29는 솔 에르다 4개(다른 계산기에서 자주 틀린 칸)
  assert.deepEqual(costBetween('mastery', 28, 29), { sol: 4, fragments: 125 });
  assert.deepEqual(costBetween('skill', 20, 10), { sol: 0, fragments: 0 });
  assert.deepEqual(costBetween('skill', -5, 99), costBetween('skill', 0, 30));
});

test('core kinds come from the Nexon core type and name', () => {
  assert.equal(kindOf({ name: '어떤 스킬', type: '스킬 코어' }), 'skill');
  assert.equal(kindOf({ name: '마스터리', type: '마스터리 코어' }), 'mastery');
  assert.equal(kindOf({ name: '강화', type: '강화 코어' }), 'enhance');
  assert.equal(kindOf({ name: '솔 야누스', type: '공용 코어' }), 'common');
  assert.equal(kindOf({ name: '솔 야누스 : 새벽', type: '공용 코어' }), 'common');
  assert.equal(kindOf({ name: '솔 헤카테', type: '공용 코어' }), 'common');
  assert.equal(kindOf({ name: '직업군 코어', type: '공용 코어' }), 'jobCommon');
});

test('plan totals, shortfall, reachable level and meso', () => {
  const rows = [
    { id: 'a', name: 'a', kind: 'skill' as const, level: 1, target: 10 },
    { id: 'b', name: 'b', kind: 'mastery' as const, level: 0, target: 1 },
  ];
  const total = planTotal(rows);
  assert.deepEqual(total, { sol: 25 + 3, fragments: 580 + 50 });
  assert.deepEqual(shortfall(total, { sol: 30, fragments: 100 }), { sol: 0, fragments: 530 });
  assert.equal(fragmentMeso(530, 6000000n), 3180000000n);
  // Lv.1 → 2(1, 30), 2 → 3(1, 35)까지 되고 3 → 4(1, 40)는 조각이 모자란다.
  assert.equal(reachableLevel('skill', 1, 30, { sol: 10, fragments: 100 }), 3);
  assert.equal(reachableLevel('skill', 1, 2, { sol: 99, fragments: 9999 }), 2);
});

test('hexa matrix response keeps only name, level and type', () => {
  assert.deepEqual(
    hexaCores({
      character_hexa_core_equipment: [
        {
          hexa_core_name: '솔 야누스',
          hexa_core_level: 12,
          hexa_core_type: '공용 코어',
          linked_skill: [{ hexa_skill_id: 'x' }],
        },
      ],
    }),
    { cores: [{ name: '솔 야누스', level: 12, type: '공용 코어' }] },
  );
  assert.deepEqual(hexaCores({ character_hexa_core_equipment: null }), { cores: [] });
});

test('nexon-hexa action validates the character and never echoes the key', async () => {
  const apiKey = 'k'.repeat(40);
  assert.equal((await nexonAction({ action: 'nexon-hexa', apiKey, ocid: 'bad' })).status, 400);
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async (url) => {
      assert.match(String(url), /character\/hexamatrix\?ocid=a{32}$/);
      return new Response(
        JSON.stringify({
          character_hexa_core_equipment: [
            { hexa_core_name: '코어', hexa_core_level: 30, hexa_core_type: '스킬 코어' },
          ],
        }),
      );
    };
    const response = await nexonAction({ action: 'nexon-hexa', apiKey, ocid: 'a'.repeat(32) });
    const text = await response.text();
    assert.equal(response.status, 200);
    assert.equal(text.includes(apiKey), false);
    assert.deepEqual(JSON.parse(text), {
      cores: [{ name: '코어', level: 30, type: '스킬 코어' }],
    });
  } finally {
    globalThis.fetch = original;
  }
});
