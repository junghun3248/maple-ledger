import assert from 'node:assert/strict';
import { test } from 'node:test';
import { aggregateWeaponStats, classifyWeapon } from '@/server/weapon-stats/model';

function mainWeapon(name: string, options: string[], slot = '무기') {
  return {
    item_equipment_slot: slot,
    item_name: name,
    additional_potential_option_1: options[0],
    additional_potential_option_2: options[1],
    additional_potential_option_3: options[2],
  };
}

test('제네시스 에디 9·6·6을 빼고 12·9·9와 12 두 줄 이상을 센다', () => {
  for (const [values, triple] of [
    [[9, 6, 6], null],
    [[12, 9, 9], 'attack'],
    [[12, 9, 12], 'attack'],
    [[12, 12, 12], 'attack'],
  ] as const) {
    const item = mainWeapon(
      '제네시스 대거',
      values.map((value) => `공격력 +${value}%`),
    );
    assert.deepEqual(classifyWeapon({ item_equipment: [item] }, 1), { weapon: 'genesis', triple });
  }
});

test('데티 주무기의 동일 스탯 3줄만 세고 보조무기를 제외한다', () => {
  const magic = ['마력 +13%', '마력 +10%', '마력 +10%'];
  const main = mainWeapon('데스티니 완드', magic);
  const sub = mainWeapon('아스트라 보조무기', magic, '보조무기');
  assert.equal(classifyWeapon({ item_equipment: [sub] }, 2), null);
  assert.equal(classifyWeapon({ item_equipment: [main] }, 1), null);
  assert.deepEqual(classifyWeapon({ preset_no: 2, item_equipment_preset_2: [sub, main] }, 3), {
    weapon: 'destiny',
    triple: 'magic',
  });
  const mixed = mainWeapon('데스티니 완드', ['마력 +13%', '마력 +10%', '공격력 +10%']);
  assert.deepEqual(classifyWeapon({ item_equipment: [mixed] }, 2), {
    weapon: 'destiny',
    triple: null,
  });
});

test('해방 확인과 무기 확인에 별도 분모를 적용한다', () => {
  const { totals, jobs } = aggregateWeaponStats([
    { job: '라라', stage: null, result: null },
    { job: '라라', stage: 1, result: null },
    { job: '라라', stage: 2, result: { weapon: 'destiny', triple: 'magic' } },
    { job: '라라', stage: 0, result: null },
  ]);
  assert.deepEqual(totals, {
    ranked: 4,
    checked: 3,
    liberated: 2,
    genesis: 0,
    destiny: 1,
    attack: 0,
    magic: 1,
  });
  assert.deepEqual(jobs, [{ job: '라라', ...totals }]);
});
