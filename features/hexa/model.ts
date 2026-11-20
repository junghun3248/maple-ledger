import type { HexaCore } from '@/contracts/hexa/schema';
import { coreCosts, MAX_LEVEL, type CoreKind } from './costs';

export type Cost = { sol: number; fragments: number };

const clampLevel = (level: number) => Math.min(MAX_LEVEL, Math.max(0, Math.trunc(level) || 0));

/** Lv.from → Lv.to에 필요한 재료. to가 from 이하이면 0이다. */
export function costBetween(kind: CoreKind, from: number, to: number): Cost {
  const start = clampLevel(from);
  const end = clampLevel(to);
  let sol = 0;
  let fragments = 0;
  for (let level = start; level < end; level++) {
    sol += coreCosts[kind][level][0];
    fragments += coreCosts[kind][level][1];
  }
  return { sol, fragments };
}

/** 가진 재료로 한 코어를 Lv.from에서 어디까지 올릴 수 있는지(목표 레벨을 넘지 않음) */
export function reachableLevel(kind: CoreKind, from: number, target: number, owned: Cost) {
  let level = clampLevel(from);
  let sol = owned.sol;
  let fragments = owned.fragments;
  while (level < clampLevel(target)) {
    const [needSol, needFragments] = coreCosts[kind][level];
    if (needSol > sol || needFragments > fragments) break;
    sol -= needSol;
    fragments -= needFragments;
    level++;
  }
  return level;
}

/**
 * 넥슨 응답의 코어 종류로 비용표를 고른다. 솔 야누스·솔 헤카테는 전 직업 공용, 그 밖의 공용 코어는 직업군 공용이다.
 * 3rd 스킬 코어는 응답만으로 구분되지 않을 수 있어 화면에서 바꿀 수 있게 한다.
 */
export function kindOf(core: Pick<HexaCore, 'name' | 'type'>): CoreKind {
  const type = core.type.replace(/\s/g, '');
  if (type.includes('마스터리')) return 'mastery';
  if (type.includes('강화')) return 'enhance';
  if (type.includes('공용'))
    return /^솔\s?(?:야누스|헤카테)/.test(core.name) ? 'common' : 'jobCommon';
  if (/3rd|3번째|세번째/i.test(type)) return 'third';
  return 'skill';
}

export type PlanRow = { id: string; name: string; kind: CoreKind; level: number; target: number };

export function planTotal(rows: PlanRow[]): Cost {
  return rows.reduce(
    (sum, row) => {
      const cost = costBetween(row.kind, row.level, row.target);
      return { sol: sum.sol + cost.sol, fragments: sum.fragments + cost.fragments };
    },
    { sol: 0, fragments: 0 },
  );
}

/** 필요 재료에서 가진 재료를 뺀 부족분(음수는 0) */
export const shortfall = (need: Cost, owned: Cost): Cost => ({
  sol: Math.max(0, need.sol - owned.sol),
  fragments: Math.max(0, need.fragments - owned.fragments),
});

/** 조각 수 × 조각 1개 가격(메소). 큰 값도 정확하도록 bigint로 계산한다. */
export const fragmentMeso = (fragments: number, price: bigint) => BigInt(fragments) * price;
