import { starBaseCost } from '@/features/income/enhancement-model';

/**
 * 스타포스 목표 비용 기댓값.
 * - 확률: 2025년 3월 개편(실패 시 하락 없음, 30성) 기준 스타캐치 없는 확률 [성공%, 파괴%].
 *   스타캐치는 성공 확률을 1.05배로 올리고, 남은 확률은 실패·파괴가 원래 비율대로 나눈다.
 * - 1회 비용: 사이트의 강화 비용 기록과 같은 식(starBaseCost)과 할인 규칙을 쓴다.
 * - 파괴: 15성 이상에서만 일어난다. 흔적으로 파괴 직전 단계(최대 22성)까지 복구하거나,
 *   같은 장비 1개로 12성부터 다시 시작한다.
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

/** 착용 레벨별 최대 성(일반 장비) */
export function maxStar(level: number) {
  if (level >= 138) return 30;
  if (level >= 128) return 20;
  if (level >= 118) return 15;
  if (level >= 108) return 10;
  if (level >= 95) return 8;
  return 5;
}

export type StarforceOptions = {
  /** 장비 착용 레벨 */
  level: number;
  from: number;
  to: number;
  starCatch: boolean;
  /** 썬데이 메이플: 강화 비용 30% 할인 */
  sundayDiscount: boolean;
  /** 썬데이 메이플: 21성 이하 파괴 확률 30% 감소 */
  sundayDestroy: boolean;
  /** MVP 할인율(0, 0.03, 0.05, 0.1) */
  mvp: number;
  pc: boolean;
  /** 15~17성 파괴 방지(기본 비용 200% 추가, 할인 없음) */
  safeguard: boolean;
  /** 파괴됐을 때: 파괴 직전 단계로 복구(최대 22성) 또는 같은 장비 1개로 12성부터 */
  onDestroy: 'restore' | 'twelve';
  /** 같은 장비(노작템) 1개 가격 */
  itemPrice: number;
};

export type StepRate = { success: number; destroy: number };

export function stepRate(star: number, o: StarforceOptions): StepRate {
  const [s, d] = RATES[star];
  const baseSuccess = s / 100;
  const success = Math.min(1, o.starCatch ? baseSuccess * 1.05 : baseSuccess);
  let destroy = baseSuccess < 1 ? (d / 100) * ((1 - success) / (1 - baseSuccess)) : 0;
  if (o.sundayDestroy && star <= 21) destroy *= 0.7;
  if (o.safeguard && star >= 15 && star <= 17) destroy = 0;
  return { success, destroy };
}

const tenLevel = (level: number) => Math.min(250, Math.floor(level / 10) * 10);

/** 한 번 강화하는 데 드는 메소 */
export function attemptCost(star: number, o: StarforceOptions) {
  const base = starBaseCost(tenLevel(o.level), star);
  // MVP·PC방 할인은 17성 미만 시도에만, 파괴 방지는 15~17성에서 할인 없이 기본 비용 2배를 더한다.
  const member = star < 17 ? o.mvp + (o.pc ? 0.05 : 0) : 0;
  const sunday = o.sundayDiscount ? 0.3 : 0;
  const safeguard = o.safeguard && star >= 15 && star <= 17 ? 2 : 0;
  return Math.floor(base * ((1 - sunday) * (1 - member) + safeguard));
}

/** 파괴됐을 때 다시 시작하는 성, 드는 메소, 드는 같은 장비 개수 */
export function afterDestroy(star: number, o: StarforceOptions) {
  if (o.onDestroy === 'twelve') return { reset: 12, meso: 0, items: 1 };
  const reset = Math.min(star, RESTORE_MAX);
  const [meso200, items] = RESTORE_AT_200[reset];
  const meso = Math.round(meso200 * (tenLevel(o.level) / 200) ** 3);
  return { reset, meso, items };
}

export type StepExpectation = {
  star: number;
  rate: StepRate;
  cost: number;
  /** 이 성에서 다음 성으로 올라가는 데 드는 평균 메소(파괴 뒤 다시 올라오는 비용 포함) */
  meso: number;
  items: number;
  destroys: number;
  attempts: number;
};

/**
 * 한 단계씩 기댓값을 구한다. 하락이 없으므로 k성 → k+1성의 평균 비용은
 * T(k) = (1회 비용 + 파괴 확률 × (복구 비용 + 파괴 뒤 k성까지 다시 오르는 비용)) ÷ 성공 확률.
 */
export function expectSteps(o: StarforceOptions) {
  const steps: StepExpectation[] = [];
  const climb = (from: number, to: number, key: 'meso' | 'items' | 'destroys' | 'attempts') =>
    steps.slice(from, to).reduce((sum, s) => sum + s[key], 0);
  for (let star = 0; star < o.to; star++) {
    const rate = stepRate(star, o);
    const cost = attemptCost(star, o);
    const after = rate.destroy > 0 ? afterDestroy(star, o) : null;
    const back = (key: 'meso' | 'items' | 'destroys' | 'attempts') =>
      after ? climb(after.reset, star, key) : 0;
    const restoreMeso = after ? after.meso + after.items * o.itemPrice : 0;
    steps.push({
      star,
      rate,
      cost,
      meso: (cost + rate.destroy * (restoreMeso + back('meso'))) / rate.success,
      items: (rate.destroy * ((after?.items ?? 0) + back('items'))) / rate.success,
      destroys: (rate.destroy * (1 + back('destroys'))) / rate.success,
      attempts: (1 + rate.destroy * back('attempts')) / rate.success,
    });
  }
  return steps.slice(o.from, o.to);
}

export type Expectation = {
  /** 평균 메소(강화비 + 복구 메소 + 같은 장비 가격) */
  meso: number;
  items: number;
  destroys: number;
  attempts: number;
  steps: StepExpectation[];
};

export function expectation(o: StarforceOptions): Expectation {
  const steps = expectSteps(o);
  const sum = (key: 'meso' | 'items' | 'destroys' | 'attempts') =>
    steps.reduce((total, s) => total + s[key], 0);
  return {
    meso: sum('meso'),
    items: sum('items'),
    destroys: sum('destroys'),
    attempts: sum('attempts'),
    steps,
  };
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
  const expected = expectation(o);
  if (expected.attempts * runs > SIM_LIMIT) return null;
  const rates = Array.from({ length: o.to }, (_, star) => stepRate(star, o));
  const costs = Array.from({ length: o.to }, (_, star) => attemptCost(star, o));
  const after = Array.from({ length: o.to }, (_, star) =>
    rates[star].destroy > 0 ? afterDestroy(star, o) : null,
  );
  const totals: number[] = [];
  for (let run = 0; run < runs; run++) {
    let star = o.from;
    let total = 0;
    while (star < o.to) {
      total += costs[star];
      const roll = random();
      const { success, destroy } = rates[star];
      if (roll < success) star++;
      else if (roll < success + destroy) {
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
