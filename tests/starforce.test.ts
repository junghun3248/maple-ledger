import test from 'node:test';
import assert from 'node:assert/strict';
import {
  afterDestroy,
  attemptCost,
  bestPlan,
  cumulative,
  expectation,
  maxStar,
  planned,
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

test('the old star catch bonus is always applied, matching the published table', () => {
  // 공개 확률표(스타캐치 적용 값 = 폐지 뒤 기본 확률): 0성 99.75%, 15성 31.5%/파괴 2.055%, 22성 15.75%/16.85%, 29성 1.05%/19.79%
  const caught = base;
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
  close(
    stepRate(21, { ...base, event: 'destroy' }).destroy,
    stepRate(21, base).destroy * 0.7,
    1e-12,
    '21성 30% 감소',
  );
  close(stepRate(22, { ...base, event: 'destroy' }).destroy, 0.1685, 1e-12, '22성은 그대로');
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
  assert.equal(
    stepRate(18, { ...base, safeguardStars: [18] }).destroy,
    stepRate(18, base).destroy,
    'not after 17',
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
  close(steps[0].meso, attemptCost(10, base) / 0.525, 1e-6, '10→11');
  close(steps[1].attempts, 1 / 0.4725, 1e-9, '11→12 시도 횟수');
  assert.equal(steps[0].destroys, 0);
});

test('a destroying step adds restore and re-climb costs', () => {
  // 16→17: 성공 31.5%, 파괴 2.055%, 파괴 시 16성으로 복구(같은 장비 1개)
  const o = { ...base, from: 16, to: 17, itemPrice: 1e9 };
  const restore = afterDestroy(16, o);
  const expected = (attemptCost(16, o) + 0.02055 * (restore.meso + 1e9)) / 0.315;
  close(expectation(o).meso, expected, 1, '16→17');
  close(expectation(o).items, 0.02055 / 0.315, 1e-9, '같은 장비 기대 개수');
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

test('optimizing picks the cheapest safeguard and restore plan for the goal', () => {
  const guardSets = [[], [15], [16], [17], [15, 16], [15, 17], [16, 17], [15, 16, 17]];
  for (const itemPrice of [0, 5e9, 50e9])
    for (const [from, to] of [
      [12, 22],
      [15, 18],
      [17, 25],
    ]) {
      const plain = { ...base, level: 250, itemPrice, from, to };
      const best = expectation(planned({ ...plain, optimize: true })).meso;
      for (const safeguardStars of guardSets)
        for (const restoreTo of RESTORE_TARGETS) {
          const fixed = expectation({ ...plain, safeguardStars, restoreTo }).meso;
          assert.ok(best <= fixed * (1 + 1e-9), `${itemPrice} ${from}→${to}`);
        }
    }
  // 같은 장비가 비싸면 15~17성 파괴 방지가 이득이고, 공짜면 파괴 방지를 쓰지 않는 게 이득이다.
  const pricey = bestPlan({ ...base, level: 250, from: 12, to: 22, itemPrice: 100e9 });
  assert.deepEqual(pricey.safeguardStars, [15, 16, 17]);
  const free = bestPlan({ ...base, level: 250, from: 12, to: 22, itemPrice: 0 });
  assert.deepEqual(free.safeguardStars, []);
  assert.ok(free.restoreTo < pricey.restoreTo || pricey.restoreTo === 22);
  // 끄면 고른 값을 그대로 쓴다.
  const manual = { ...base, safeguardStars: [16], restoreTo: 18 };
  assert.equal(planned(manual), manual);
});

test('the closed-form expectation matches a simulation', () => {
  for (const restoreTo of [22, 18, 12]) {
    const o = { ...base, from: 15, to: 22, restoreTo, itemPrice: 5e8 };
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
  assert.equal(simulate({ ...base, from: 22, to: 30 }), null);
  const r = simulate({ ...base, from: 0, to: 15 }, 500, seededRandom(3));
  assert.ok(r && r.median <= r.unlucky);
});

test('max stars depend on the equipment level', () => {
  assert.equal(maxStar(200), 30);
  assert.equal(maxStar(138), 30);
  assert.equal(maxStar(130), 20);
  assert.equal(maxStar(120), 15);
});
