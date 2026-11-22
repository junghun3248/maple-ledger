import test from 'node:test';
import assert from 'node:assert/strict';
import {
  afterDestroy,
  attemptCost,
  cumulative,
  expectation,
  expectSteps,
  maxStar,
  RESTORE_TARGETS,
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
  event: 'none',
  mvp: 0,
  pc: false,
  safeguardStars: [],
  restoreTo: 22,
  optimize: false,
  itemPrice: 0,
};

const close = (actual: number, expected: number, tolerance: number, label: string) =>
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${label}: ${actual} vs ${expected} (±${tolerance})`,
  );

test('star catch raises success by 5% and splits the rest like the official table', () => {
  // 공개 확률표(스타캐치 적용): 0성 99.75%, 15성 31.5%/파괴 2.055%, 22성 15.75%/16.85%, 29성 1.05%/19.79%
  const caught = { ...base, starCatch: true };
  close(stepRate(0, caught).success, 0.9975, 1e-9, '0성 성공');
  close(stepRate(15, caught).destroy, 0.02055, 1e-9, '15성 파괴');
  close(stepRate(22, caught).success, 0.1575, 1e-9, '22성 성공');
  close(stepRate(22, caught).destroy, 0.1685, 1e-9, '22성 파괴');
  close(stepRate(29, caught).destroy, 0.1979, 1e-4, '29성 파괴');
  assert.equal(stepRate(14, caught).destroy, 0, 'no destruction under 15 stars');
});

test('events change cost, destruction and restore cost as listed', () => {
  const plain = attemptCost(18, base);
  assert.equal(attemptCost(18, { ...base, event: 'discount' }), Math.floor(plain * 0.7));
  close(stepRate(21, { ...base, event: 'destroy' }).destroy, 0.1275 * 0.7, 1e-12, '21성 30% 감소');
  close(stepRate(22, { ...base, event: 'destroy' }).destroy, 0.17, 1e-12, '22성은 그대로');
  // 샤이닝: 비용 30% 할인 + 파괴 30% 감소 + 복구 비용 20% 할인
  const shining = { ...base, event: 'shining' as const };
  assert.equal(attemptCost(18, shining), attemptCost(18, { ...base, event: 'discount' }));
  close(afterDestroy(18, shining).meso, afterDestroy(18, base).meso * 0.8, 1, '복구 20% 할인');
  // 15·16성 100%
  assert.deepEqual(stepRate(15, { ...base, event: 'shiningPlus' }), { success: 1, destroy: 0 });
  assert.deepEqual(stepRate(16, { ...base, event: 'shiningPlus' }), { success: 1, destroy: 0 });
  assert.notEqual(stepRate(17, { ...base, event: 'shiningPlus' }).success, 1);
});

test('safeguard works per star from 15 to 17 and adds 200% without discounts', () => {
  const guarded = { ...base, safeguardStars: [16] };
  assert.equal(stepRate(16, guarded).destroy, 0);
  assert.notEqual(stepRate(15, guarded).destroy, 0, 'only the chosen star');
  assert.equal(
    attemptCost(16, { ...guarded, event: 'discount' }),
    Math.floor(attemptCost(16, base) * (0.7 + 2)),
  );
  assert.equal(stepRate(18, { ...base, safeguardStars: [18] }).destroy, 0.068, 'not after 17');
});

test('restore costs follow the published table and scale with level cubed', () => {
  // 표: 140제 15성 1.49억, 250제 15성 8.46억·22성 473억(같은 장비 4개)
  close(afterDestroy(15, { ...base, level: 140 }).meso, 1.49e8, 0.01e8, '140제 15성');
  close(afterDestroy(15, { ...base, level: 250 }).meso, 8.46e8, 0.01e8, '250제 15성');
  const deep = afterDestroy(25, { ...base, level: 250 });
  assert.equal(deep.reset, 22, 'restore stops at 22 stars');
  assert.equal(deep.items, 4);
  close(deep.meso, 473e8, 1e8, '250제 22성');
  // 12성: 같은 장비 1개만
  assert.deepEqual(afterDestroy(18, { ...base, restoreTo: 12 }), { reset: 12, meso: 0, items: 1 });
  // 확정 복구 18성: 21성에서 파괴돼도 18성까지만, 16성에서 파괴되면 16성까지만
  const fixed = { ...base, restoreTo: 18 };
  assert.equal(afterDestroy(21, fixed).reset, 18);
  assert.equal(afterDestroy(21, fixed).meso, afterDestroy(18, base).meso);
  assert.equal(afterDestroy(16, fixed).reset, 16);
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

test('the cumulative table adds steps from the starting star', () => {
  const rows = cumulative({ ...base, from: 12 });
  assert.equal(rows[0].target, 13);
  assert.equal(rows.at(-1)!.target, 30);
  const to22 = rows.find((r) => r.target === 22)!;
  close(to22.meso, expectation({ ...base, from: 12, to: 22 }).meso, 1, '12→22 누적');
  assert.ok(
    rows.every((r, i) => i === 0 || r.meso > rows[i - 1].meso),
    'grows with each star',
  );
});

test('optimizing never costs more and picks the cheaper choice per star', () => {
  for (const itemPrice of [0, 5e9, 50e9]) {
    const plain = { ...base, level: 250, itemPrice, starCatch: true };
    const best = expectSteps({ ...plain, optimize: true });
    for (const guard of [[], [15, 16, 17]])
      for (const restoreTo of RESTORE_TARGETS) {
        const fixed = expectSteps({ ...plain, safeguardStars: guard, restoreTo });
        fixed.forEach((s, i) => assert.ok(best[i].meso <= s.meso + 1e-6, `${itemPrice} ${i}`));
      }
  }
  // 같은 장비가 비싸면 15~17성은 파괴 방지가 이득이다.
  const pricey = expectSteps({ ...base, level: 250, itemPrice: 100e9, optimize: true });
  assert.equal(pricey[17].choice.safeguard, true);
});

test('the closed-form expectation matches a simulation', () => {
  for (const restoreTo of [22, 18, 12]) {
    const o = { ...base, from: 15, to: 22, starCatch: true, restoreTo, itemPrice: 5e8 };
    const exact = expectation(o).meso;
    // 한 번씩 4000번 굴린 평균이 계산한 기댓값과 6% 안으로 맞아야 한다.
    const runs = 4000;
    const random = seededRandom(11);
    let sum = 0;
    for (let i = 0; i < runs; i++) sum += simulate(o, 1, random)!.median;
    close(sum / runs, exact, exact * 0.06, `${restoreTo}성 복구 평균`);
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
