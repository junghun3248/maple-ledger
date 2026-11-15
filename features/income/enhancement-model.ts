import type { EnhancementRow } from '@/contracts/ledger/enhancement-schema';
import type { AssetSettings, Expense } from '@/contracts/ledger/finance-schema';
import { koreaDate } from '@/lib/ledger/korea-date';

// 강화 비용 계산은 Codex의 강화 이력 지출 작업(2026-11-11)을 옮겨 왔다.
// 비용표는 2026-10-22 개편 이후 기준이며 실제 차감액이 아닌 추정값이다.

export type EnhancementSettings = {
  levels: Record<string, number>;
  mvp: number;
  pc: boolean;
  huntIncluded: boolean;
};
export const MVP_DISCOUNTS = [0, 0.03, 0.05, 0.1];

const starDivisors: Record<number, number> = {
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
/** 스타포스 1회 기본 비용 (KMS 커뮤니티 측정식, 할인 전). level은 10 단위로 내린 장비 레벨 */
export function starBaseCost(level: number, stars: number) {
  if (!Number.isInteger(level) || level < 1 || level > 250)
    throw Error('장비 레벨을 확인해 주세요.');
  if (!Number.isInteger(stars) || stars < 0 || stars >= 30)
    throw Error('강화 단계를 확인해 주세요.');
  const scaled =
    level ** 3 *
    (stars < 10 ? (stars + 1) / 2500 : (stars + 1) ** 2.7 / (starDivisors[stars] || 20000));
  return Math.round(10 + scaled) * 100;
}

const resetCosts = {
  potential: [
    [4000000, 16000000, 34000000, 40000000],
    [4250000, 17000000, 36125000, 42500000],
    [4500000, 18000000, 38250000, 45000000],
    [5000000, 20000000, 42500000, 50000000],
  ],
  additional: [
    [9750000, 27300000, 66300000, 78000000],
    [10375000, 29050000, 70550000, 83000000],
    [11000000, 30800000, 74800000, 88000000],
    [12250000, 34300000, 83300000, 98000000],
  ],
};
/** 메소 잠재능력 재설정 1회 비용. grade는 재설정 전 등급(1 레어 ~ 4 레전드리) */
export function resetCost(mode: 'potential' | 'additional', level: number, grade: number) {
  if (!Number.isInteger(grade) || grade < 1 || grade > 4) throw Error('등급을 확인해 주세요.');
  if (!Number.isInteger(level) || level < 1 || level > 250)
    throw Error('장비 레벨을 확인해 주세요.');
  const band = level < 160 ? 0 : level < 200 ? 1 : level < 250 ? 2 : 3;
  return resetCosts[mode][band][grade - 1];
}

export function enhancementCost(row: EnhancementRow, settings: EnhancementSettings): number | null {
  if (row.excluded) return null;
  if (row.kind === 'potential') {
    if (!row.level || !row.grade || !row.rolls) return null;
    return resetCost(row.additional ? 'additional' : 'potential', row.level, row.grade) * row.rolls;
  }
  const level = settings.levels[row.item];
  if (
    !Number.isInteger(level) ||
    level < 10 ||
    level > 250 ||
    !MVP_DISCOUNTS.includes(settings.mvp) ||
    row.stars === undefined ||
    row.discount === undefined
  )
    return null;
  const base = starBaseCost(Math.floor(level / 10) * 10, row.stars);
  // MVP·PC방 할인은 17성 미만 시도에만, 파괴 방지는 15~17성에서 기본 비용 2배를 더한다.
  const member = row.stars < 17 ? settings.mvp + (settings.pc ? 0.05 : 0) : 0;
  const safeguard = row.safeguard && row.stars >= 15 && row.stars <= 17 ? 2 : 0;
  return Math.floor(base * ((1 - row.discount) * (1 - member) + safeguard));
}

export async function enhancementId(row: EnhancementRow) {
  const hash = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(`${row.kind}:${row.id}`),
  );
  return 'nx-' + Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, '0')).join('');
}

function memo(row: EnhancementRow) {
  const action =
    row.kind === 'starforce'
      ? `${row.stars}→${row.stars! + 1}성 시도`
      : `${row.additional ? '에디셔널' : '잠재능력'} 재설정 ${row.rolls}회`;
  return `${row.character} · ${row.item} · ${action}`.slice(0, 200);
}

/** 계산한 강화 비용을 지출로 추가한다. 이미 있거나 삭제한 이력은 다시 넣지 않는다. */
export async function mergeEnhancements(
  assets: AssetSettings,
  rows: EnhancementRow[],
  settings: EnhancementSettings,
) {
  const seen = new Set([
    ...assets.expenses.map((e) => e.id),
    ...(assets.ignoredEnhancements || []),
  ]);
  const added: Expense[] = [];
  let duplicate = 0,
    excluded = 0;
  for (const row of rows) {
    const id = await enhancementId(row);
    if (seen.has(id)) {
      duplicate++;
      continue;
    }
    const amount = enhancementCost(row, settings);
    if (amount === null || !Number.isSafeInteger(amount) || amount < 0) {
      excluded++;
      continue;
    }
    added.push({
      id,
      amount: String(amount),
      date: koreaDate(Date.parse(row.at)),
      category: 'enhancement',
      memo: memo(row),
      huntIncluded: settings.huntIncluded,
      createdAt: row.at,
      calculated: true,
    });
    seen.add(id);
  }
  return {
    finance: { ...assets, expenses: [...assets.expenses, ...added] },
    added: added.length,
    duplicate,
    excluded,
  };
}

/** 메소 기록에서 빼는 강화 비용: 이력으로 계산했고 사냥 차액에 포함되지 않은 것만 */
export const isEnhancementSpend = (e: Expense) =>
  e.category === 'enhancement' && e.calculated === true && !e.huntIncluded;

/** 날짜별 강화 비용 합계와 건수 */
export function enhancementDays(expenses: Expense[]) {
  const days = new Map<string, { amount: bigint; count: number; ids: string[] }>();
  for (const e of expenses) {
    if (e.category !== 'enhancement' || !e.calculated) continue;
    const day = days.get(e.date) || { amount: 0n, count: 0, ids: [] };
    day.amount += BigInt(e.amount);
    day.count++;
    day.ids.push(e.id);
    days.set(e.date, day);
  }
  return [...days.entries()]
    .map(([date, v]) => ({ date, ...v }))
    .sort((a, b) => (a.date < b.date ? 1 : -1));
}

/** 선택한 날짜의 자동 강화 비용을 지운다. 조건(레벨·할인)을 고쳐 다시 가져올 수 있다. */
export function removeEnhancementDay(assets: AssetSettings, date: string): AssetSettings {
  return {
    ...assets,
    expenses: assets.expenses.filter(
      (e) => !(e.date === date && e.category === 'enhancement' && e.calculated),
    ),
  };
}
