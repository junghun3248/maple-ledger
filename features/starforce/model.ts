import { starBaseCost } from '@/features/income/enhancement-model';

/**
 * 스타포스 목표 비용 기댓값.
 * - 확률: 2025년 3월 개편(실패 시 하락 없음, 30성) 기준 스타캐치 없는 확률 [성공%, 파괴%].
 *   스타캐치는 성공 확률을 1.05배로 올리고, 남은 확률은 실패·파괴가 원래 비율대로 나눈다.
 * - 1회 비용: 사이트의 강화 비용 기록과 같은 식(starBaseCost)과 할인 규칙을 쓴다.
 * - 파괴: 15성 이상에서만 일어난다. 흔적으로 15~22성 중 파괴 직전 별 이하의 별까지 복구하거나
 *   (메소 + 같은 장비 1~4개), 같은 장비 1개만으로 12성부터 다시 시작한다.
 */
export const MAX_STAR = 30;
const RATES: [number, number][] = [
  [95, 0], [90, 0], [85, 0], [85, 0], [80, 0], [75, 0], [70, 0], [65, 0], [60, 0], [55, 0],
  [50, 0], [45, 0], [40, 0], [35, 0], [30, 0],
  [30, 2.1], [30, 2.1], [15, 6.8], [15, 6.8], [15, 8.5], [30, 10.5], [15, 12.75], [15, 17],
  [10, 18], [10, 18], [10, 18], [7, 18.6], [5, 19], [3, 19.4], [1, 19.8],
]; // prettier-ignore

/** 200제 기준 파괴 복구 메소(복구 단계 15~22성)와 필요한 같은 장비 개수. 다른 레벨은 레벨³에 비례한다. */
const RESTORE_AT_200: Record<number, [number, number]> = {
  15: [4.33e8, 1],
  16: [10.5e8, 1],
  17: [17.7e8, 1],
  18: [40.1e8, 1],
  19: [66.5e8, 2],
  20: [118e8, 2],
  21: [148e8, 3],
  22: [242e8, 4],
};
export const RESTORE_MAX = 22;
export const SAFEGUARD_STARS = [15, 16, 17];
/** 파괴됐을 때 복구할 별: 12(같은 장비만), 15~22(그 별까지 복구, 파괴 직전 별보다 높게는 못 함) */
export const RESTORE_TARGETS = [12, 15, 16, 17, 18, 19, 20, 21, 22];

/** 착용 레벨별 최대 성(일반 장비) */
export function maxStar(level: number) {
  if (level >= 138) return 30;
  if (level >= 128) return 20;
  if (level >= 118) return 15;
  if (level >= 108) return 10;
  if (level >= 95) return 8;
  return 5;
}

/**
 * 이벤트
 * - discount: 강화 비용 30% 할인
 * - destroy: 21성 이하 파괴 확률 30% 감소
 * - shining: 샤이닝 스타포스(비용 30% 할인 + 21성 이하 파괴 30% 감소 + 복구 비용 20% 할인)
 * - shiningPlus: shining + 15·16성 강화 성공 100%
 */
export const events = ['none', 'discount', 'destroy', 'shining', 'shiningPlus'] as const;
export type StarforceEvent = (typeof events)[number];

export type StarforceOptions = {
  /** 장비 착용 레벨 */
  level: number;
  /** 시작 별(누적 표의 출발점) */
  from: number;
  /** 목표 별(목표 등록·운 계산에 쓴다) */
  to: number;
  starCatch: boolean;
  event: StarforceEvent;
  /** MVP 할인율(0, 0.03, 0.05, 0.1) */
  mvp: number;
  pc: boolean;
  /** 파괴 방지를 쓰는 별(15·16·17 중) */
  safeguardStars: number[];
  /** 파괴됐을 때 복구할 별(RESTORE_TARGETS 중). 22면 늘 파괴 직전 별까지 복구한다 */
  restoreTo: number;
  /** 켜면 별마다 파괴 방지·복구를 평균 비용이 가장 적은 쪽으로 고른다 */
  optimize: boolean;
  /** 같은 장비(노작) 1개 가격 */
  itemPrice: number;
};

export type StepRate = { success: number; destroy: number };
/** 한 별에서 실제로 쓰는 선택: 파괴 방지 여부, 파괴되면 다시 시작하는 별 */
export type StepChoice = { safeguard: boolean; reset: number };

/** star에서 파괴됐을 때 restoreTo 설정으로 실제 다시 시작하는 별 */
export const resetStar = (star: number, restoreTo: number) =>
  restoreTo <= 12 ? 12 : Math.min(star, restoreTo, RESTORE_MAX);

const costDiscount = (e: StarforceEvent) => e !== 'none' && e !== 'destroy';
const destroyCut = (e: StarforceEvent) => e !== 'none' && e !== 'discount';
const shining = (e: StarforceEvent) => e === 'shining' || e === 'shiningPlus';

export function stepRate(star: number, o: StarforceOptions, choice?: StepChoice): StepRate {
  if (o.event === 'shiningPlus' && (star === 15 || star === 16)) return { success: 1, destroy: 0 };
  const [s, d] = RATES[star];
  const baseSuccess = s / 100;
  const success = Math.min(1, o.starCatch ? baseSuccess * 1.05 : baseSuccess);
  let destroy = baseSuccess < 1 ? (d / 100) * ((1 - success) / (1 - baseSuccess)) : 0;
  if (destroyCut(o.event) && star <= 21) destroy *= 0.7;
  const guard = choice ? choice.safeguard : o.safeguardStars.includes(star);
  if (guard && SAFEGUARD_STARS.includes(star)) destroy = 0;
  return { success, destroy };
}

const tenLevel = (level: number) => Math.min(250, Math.floor(level / 10) * 10);

/** 한 번 강화하는 데 드는 메소 */
export function attemptCost(star: number, o: StarforceOptions, choice?: StepChoice) {
  const base = starBaseCost(tenLevel(o.level), star);
  // MVP·PC방 할인은 17성 미만 시도에만, 파괴 방지는 15~17성에서 할인 없이 기본 비용 2배를 더한다.
  const member = star < 17 ? o.mvp + (o.pc ? 0.05 : 0) : 0;
  const event = costDiscount(o.event) ? 0.3 : 0;
  const guard = choice ? choice.safeguard : o.safeguardStars.includes(star);
  const safeguard = guard && SAFEGUARD_STARS.includes(star) ? 2 : 0;
  return Math.floor(base * ((1 - event) * (1 - member) + safeguard));
}

/** 파괴됐을 때 다시 시작하는 성, 드는 메소, 드는 같은 장비 개수 */
export function afterDestroy(star: number, o: StarforceOptions, choice?: StepChoice) {
  const reset = choice ? choice.reset : resetStar(star, o.restoreTo);
  if (reset < 15) return { reset: 12, meso: 0, items: 1 };
  const [meso200, items] = RESTORE_AT_200[reset];
  const discount = shining(o.event) ? 0.8 : 1;
  const meso = Math.round(meso200 * (tenLevel(o.level) / 200) ** 3 * discount);
  return { reset, meso, items };
}

export type StepExpectation = {
  star: number;
  choice: StepChoice;
  rate: StepRate;
  cost: number;
  /** 이 성에서 다음 성으로 올라가는 데 드는 평균 메소(파괴 뒤 다시 올라오는 비용 포함) */
  meso: number;
  items: number;
  destroys: number;
  attempts: number;
};
type Key = 'meso' | 'items' | 'destroys' | 'attempts';

function choicesFor(star: number, o: StarforceOptions): StepChoice[] {
  const given: StepChoice = {
    safeguard: o.safeguardStars.includes(star),
    reset: resetStar(star, o.restoreTo),
  };
  if (!o.optimize || star < 15) return [given];
  const guards = SAFEGUARD_STARS.includes(star) ? [false, true] : [false];
  const resets = RESTORE_TARGETS.filter((r) => r === 12 || r <= Math.min(star, RESTORE_MAX));
  return guards.flatMap((safeguard) => resets.map((reset) => ({ safeguard, reset })));
}

/**
 * 0성부터 각 별의 기댓값을 구한다. 하락이 없으므로 k성 → k+1성의 평균 비용은
 * T(k) = (1회 비용 + 파괴 확률 × (복구 비용 + 파괴 뒤 k성까지 다시 오르는 비용)) ÷ 성공 확률.
 * 최적화를 켜면 별마다 T(k)가 가장 작은 선택을 쓴다(k의 선택은 T(k)에만 영향을 준다).
 */
export function expectSteps(o: StarforceOptions) {
  const steps: StepExpectation[] = [];
  const climb = (from: number, to: number, key: Key) =>
    steps.slice(from, to).reduce((sum, s) => sum + s[key], 0);
  const top = maxStar(o.level);
  for (let star = 0; star < top; star++) {
    let best: StepExpectation | null = null;
    for (const choice of choicesFor(star, o)) {
      const rate = stepRate(star, o, choice);
      const cost = attemptCost(star, o, choice);
      const after = rate.destroy > 0 ? afterDestroy(star, o, choice) : null;
      const back = (key: Key) => (after ? climb(after.reset, star, key) : 0);
      const restoreMeso = after ? after.meso + after.items * o.itemPrice : 0;
      const step: StepExpectation = {
        star,
        choice,
        rate,
        cost,
        meso: (cost + rate.destroy * (restoreMeso + back('meso'))) / rate.success,
        items: (rate.destroy * ((after?.items ?? 0) + back('items'))) / rate.success,
        destroys: (rate.destroy * (1 + back('destroys'))) / rate.success,
        attempts: (1 + rate.destroy * back('attempts')) / rate.success,
      };
      if (!best || step.meso < best.meso) best = step;
    }
    steps.push(best!);
  }
  return steps;
}

export type Expectation = {
  /** 평균 메소(강화비 + 복구 메소 + 같은 장비 가격) */
  meso: number;
  items: number;
  destroys: number;
  attempts: number;
};

const sumOf = (steps: StepExpectation[]): Expectation => ({
  meso: steps.reduce((t, s) => t + s.meso, 0),
  items: steps.reduce((t, s) => t + s.items, 0),
  destroys: steps.reduce((t, s) => t + s.destroys, 0),
  attempts: steps.reduce((t, s) => t + s.attempts, 0),
});

/** from → to 기댓값과 그 사이 단계들 */
export function expectation(o: StarforceOptions) {
  const steps = expectSteps(o).slice(o.from, o.to);
  return { ...sumOf(steps), steps };
}

/** 시작 별에서 각 별까지의 누적 기댓값(표용) */
export function cumulative(o: StarforceOptions) {
  const steps = expectSteps(o);
  const rows: (Expectation & { target: number; step: StepExpectation })[] = [];
  for (let to = o.from + 1; to <= steps.length; to++)
    rows.push({ target: to, step: steps[to - 1], ...sumOf(steps.slice(o.from, to)) });
  return rows;
}

/** 재현 가능한 난수(시뮬레이션·테스트용) */
export function seededRandom(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

export const SIM_LIMIT = 3_000_000;

/**
 * 여러 번 직접 강화해 보고 중앙값·운 나쁜 10%(상위 90번째) 비용을 구한다.
 * 평균 시도 횟수가 너무 많으면(예: 29→30성) 브라우저가 멈추지 않도록 null을 돌려준다.
 */
export function simulate(o: StarforceOptions, runs = 2000, random = Math.random) {
  const all = expectSteps(o);
  const expected = sumOf(all.slice(o.from, o.to));
  if (expected.attempts * runs > SIM_LIMIT) return null;
  const after = all.map((s) => (s.rate.destroy > 0 ? afterDestroy(s.star, o, s.choice) : null));
  const totals: number[] = [];
  for (let run = 0; run < runs; run++) {
    let star = o.from;
    let total = 0;
    while (star < o.to) {
      const s = all[star];
      total += s.cost;
      const roll = random();
      if (roll < s.rate.success) star++;
      else if (roll < s.rate.success + s.rate.destroy) {
        const a = after[star]!;
        total += a.meso + a.items * o.itemPrice;
        star = a.reset;
      }
    }
    totals.push(total);
  }
  totals.sort((a, b) => a - b);
  const at = (q: number) => totals[Math.min(totals.length - 1, Math.floor(q * totals.length))];
  return { median: at(0.5), unlucky: at(0.9), runs };
}
