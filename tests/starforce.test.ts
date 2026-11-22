import test from 'node:test';
import assert from 'node:assert/strict';
import {
  afterDestroy,
  attemptCost,
  expectation,
  maxStar,
  seededRandom,
  simulate,
  stepRate,
  type StarforceOptions,
} from '@/features/starforce/model';

const base: StarforceOptions = {
  level: 200,
  from: 0,
  to: 22,
  starCatch: false,
  sundayDiscount: false,
  sundayDestroy: false,
  mvp: 0,
  pc: false,
  safeguard: false,
  onDestroy: 'restore',
  itemPrice: 0,
};

const close = (actual: number, expected: number, tolerance: number, label: string) =>
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${label}: ${actual} vs ${expected} (±${tolerance})`,
  );

test('star catch raises success by 5% and splits the rest like the official table', () => {
  // 나무위키 확률표(스타캐치 적용): 0성 99.75%, 15성 31.5%/파괴 2.055%, 22성 15.75%/16.85%, 29성 1.05%/19.79%
  const caught = { ...base, starCatch: true };
  close(stepRate(0, caught).success, 0.9975, 1e-9, '0성 성공');
  close(stepRate(15, caught).destroy, 0.02055, 1e-9, '15성 파괴');
  close(stepRate(22, caught).success, 0.1575, 1e-9, '22성 성공');
  close(stepRate(22, caught).destroy, 0.1685, 1e-9, '22성 파괴');
  close(stepRate(29, caught).destroy, 0.1979, 1e-4, '29성 파괴');
  assert.equal(stepRate(14, caught).destroy, 0, 'no destruction under 15 stars');
});

test('Sunday destroy reduction stops at 21 stars and safeguard covers 15 to 17', () => {
  const sunday = { ...base, sundayDestroy: true };
  close(stepRate(21, sunday).destroy, 0.1275 * 0.7, 1e-12, '21성 30% 감소');
  close(stepRate(22, sunday).destroy, 0.17, 1e-12, '22성은 그대로');
  const guarded = { ...base, safeguard: true };
  assert.equal(stepRate(17, guarded).destroy, 0);
  assert.equal(stepRate(18, guarded).destroy, 0.068);
  // 파괴 방지는 할인 없이 기본 비용 200%를 더한다.
  assert.equal(
    attemptCost(16, { ...guarded, sundayDiscount: true }),
    Math.floor(attemptCost(16, base) * (0.7 + 2)),
  );
});

test('restore costs follow the published table and scale with level cubed', () => {
  // 표: 140제 15성 1.49억, 250제 15성 8.46억·22성 473억(같은 장비 4개)
  close(afterDestroy(15, { ...base, level: 140 }).meso, 1.49e8, 0.01e8, '140제 15성');
  close(afterDestroy(15, { ...base, level: 250 }).meso, 8.46e8, 0.01e8, '250제 15성');
  const deep = afterDestroy(25, { ...base, level: 250 });
  assert.equal(deep.reset, 22, 'restore stops at 22 stars');
  assert.equal(deep.items, 4);
  close(deep.meso, 473e8, 1e8, '250제 22성');
  assert.deepEqual(afterDestroy(18, { ...base, onDestroy: 'twelve' }), {
    reset: 12,
    meso: 0,
    items: 1,
  });
});

test('without destruction a step costs one attempt divided by the success rate', () => {
  const steps = expectation({ ...base, from: 10, to: 12 }).steps;
  assert.equal(steps.length, 2);
  close(steps[0].meso, attemptCost(10, base) / 0.5, 1e-6, '10→11');
  close(steps[1].attempts, 1 / 0.45, 1e-9, '11→12 시도 횟수');
  assert.equal(steps[0].destroys, 0);
});

test('a destroying step adds restore and re-climb costs', () => {
  // 16→17: 성공 30%, 파괴 2.1%, 파괴 시 16성으로 복구(같은 장비 1개)
  const o = { ...base, from: 16, to: 17, itemPrice: 1e9 };
  const restore = afterDestroy(16, o);
  const expected = (attemptCost(16, o) + 0.021 * (restore.meso + 1e9)) / 0.3;
  close(expectation(o).meso, expected, 1, '16→17');
  close(expectation(o).items, 0.021 / 0.3, 1e-12, '같은 장비 기대 개수');
});

test('the closed-form expectation matches a simulation', () => {
  for (const onDestroy of ['restore', 'twelve'] as const) {
    const o = { ...base, from: 15, to: 22, starCatch: true, onDestroy, itemPrice: 5e8 };
    const exact = expectation(o).meso;
    // 한 번씩 4000번 굴린 평균이 계산한 기댓값과 6% 안으로 맞아야 한다.
    const runs = 4000;
    const random = seededRandom(11);
    let sum = 0;
    for (let i = 0; i < runs; i++) sum += simulate(o, 1, random)!.median;
    close(sum / runs, exact, exact * 0.06, `${onDestroy} 평균`);
  }
});

test('very long goals skip the simulation instead of freezing the page', () => {
  assert.equal(simulate({ ...base, from: 22, to: 30, starCatch: true }), null);
  const r = simulate({ ...base, from: 0, to: 15, starCatch: true }, 500, seededRandom(3));
  assert.ok(r && r.median <= r.unlucky);
});

test('max stars depend on the equipment level', () => {
  assert.equal(maxStar(200), 30);
  assert.equal(maxStar(138), 30);
  assert.equal(maxStar(130), 20);
  assert.equal(maxStar(120), 15);
});
