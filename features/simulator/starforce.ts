const baseSuccess = [
  0.95, 0.9, 0.85, 0.85, 0.8, 0.75, 0.7, 0.65, 0.6, 0.55, 0.5, 0.45, 0.4, 0.35, 0.3, 0.3, 0.3, 0.15,
  0.15, 0.15, 0.3, 0.15, 0.15, 0.1, 0.1, 0.1, 0.07, 0.05, 0.03, 0.01,
];
const baseBoom = [
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.021, 0.021, 0.068, 0.068, 0.085, 0.105, 0.1275,
  0.17, 0.18, 0.18, 0.18, 0.186, 0.19, 0.194, 0.198,
];
export function maxStars(level: number) {
  return level < 95
    ? 5
    : level < 108
      ? 8
      : level < 118
        ? 10
        : level < 128
          ? 15
          : level < 138
            ? 20
            : 30;
}
export function starRates(stars: number, safe = false, reduceBoom = false, guaranteed = false) {
  if (!Number.isInteger(stars) || stars < 0 || stars >= 30)
    throw Error('강화 단계를 확인해 주세요.');
  const success = guaranteed && [5, 10, 15].includes(stars) ? 1 : baseSuccess[stars] * 1.05;
  const boom =
    safe && stars >= 15 && stars <= 17
      ? 0
      : ((baseBoom[stars] * (1 - success)) / (1 - baseSuccess[stars])) *
        (reduceBoom && stars <= 21 ? 0.7 : 1);
  return { success, boom, stay: 1 - success - boom };
}
export function starRoll(
  stars: number,
  safe = false,
  reduceBoom = false,
  guaranteed = false,
  rng = Math.random,
) {
  const rates = starRates(stars, safe, reduceBoom, guaranteed),
    value = rng();
  if (value < rates.success) return { stars: stars + 1, result: '성공' as const };
  if (value < rates.success + rates.boom)
    return { stars: Math.min(stars, 22), result: '파괴' as const };
  return { stars, result: '유지' as const };
}
export const restoreItems = (trace: number) =>
  trace <= 18 ? 1 : trace <= 20 ? 2 : trace === 21 ? 3 : 4;

// KMS cost model: community-measured formula, independently implemented.
// https://www.inven.co.kr/board/maple/5974/4775145
export function starCost(level: number, stars: number, safe = false, discount = false, mvp = 0) {
  if (
    !Number.isInteger(level) ||
    level < 1 ||
    level > 250 ||
    !Number.isInteger(stars) ||
    stars < 0 ||
    stars >= maxStars(level)
  )
    throw Error('장비 레벨과 강화를 확인해 주세요.');
  if (![0, 0.03, 0.05, 0.1].includes(mvp)) throw Error('MVP 할인을 확인해 주세요.');
  const divisors: Record<number, number> = {
    10: 40000,
    11: 22000,
    12: 15000,
    13: 11000,
    14: 7500,
    17: 15000,
    18: 7000,
    19: 4500,
    21: 12500,
  };
  const scaled =
    level ** 3 *
    (stars < 10 ? (stars + 1) / 2500 : (stars + 1) ** 2.7 / (divisors[stars] || 20000));
  const base = Math.round(10 + scaled) * 100;
  const factor =
    (discount ? 0.7 : 1) * (stars < 17 ? 1 - mvp : 1) +
    (safe && stars >= 15 && stars <= 17 ? 2 : 0);
  return Math.floor(base * factor);
}
