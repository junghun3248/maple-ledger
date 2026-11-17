import type { BossState, ItemDefinition } from '@/contracts/boss/state';
import { boardRuns, weekKey } from './model';

/** 주간 보스는 목요일 0시(KST)에 초기화되므로 수요일이 이번 주 마지막 날이다. */
export const isResetEve = (today: string) => new Date(today + 'T00:00:00Z').getUTCDay() === 3;

/** 드롭할 때 에픽빔이 뜨지 않는 아이템. 알림에는 에픽빔이 뜨는 아이템만 보여 준다. */
const noEpicBeam = /^(?:[123]단계 소울 에테르|파풀라투스 마크)$/;
export const hasEpicBeam = (name: string) => !noEpicBeam.test(name);

/**
 * 알림에 보여 줄 아이템 수와 우선순위(사용자 지정, 2026-11-17). 1~3순위 묶음 안에서도 적힌 순서대로 먼저 보여 주고,
 * 목록에 없는 에픽빔 아이템은 맨 뒤에 둔다(창세의 뱃지는 월간 보스라 주간 알림에 나오지 않는다). 이름이 이 값으로 시작하면 맞는 것으로 본다(익셉셔널 해머 5종).
 */
export const DROP_LIMIT = 3;
const priority = [
  // 1순위
  '오만의 원죄',
  '굶주리는 핏빛 원혼',
  '황홀한 악몽',
  '근원의 속삭임',
  '불멸의 유산',
  '죽음의 맹세',
  '익셉셔널 해머',
  '컴플리트 언더컨트롤',
  // 2순위
  '4단계 소울 에테르',
  '몽환의 벨트',
  '마도서',
  '거대한 공포',
  '고통의 근원',
  // 3순위
  '생명의 연마석',
  '신념의 연마석',
  '커맨더 포스 이어링',
  '루즈 컨트롤 머신 마크',
  '마력이 깃든 안대',
  '미트라의 분노',
];
const rankOf = (name: string) => {
  const rank = priority.findIndex((prefix) => name.startsWith(prefix));
  return rank < 0 ? priority.length : rank;
};

export type LeftBoss = {
  character: string;
  name: string;
  difficulty: string;
  crystal: bigint;
};

/**
 * 이번 주 일정에 넣었지만 아직 안 잡은 주간 보스, 받을 수 있는 결정석(1인 몫)과
 * 그 보스들에서 나올 수 있는 아이템 목록.
 */
export function weeklyLeft(
  state: BossState,
  today: string,
  items: ItemDefinition[],
  rules: Record<string, string[]>,
) {
  const bosses: LeftBoss[] = [];
  const sources = new Map<string, Set<string>>();
  for (const c of state.characters)
    for (const r of boardRuns(c, today, 'week')) {
      if (r.cleared || weekKey(r.date) !== weekKey(today)) continue;
      bosses.push({
        character: c.name,
        name: r.name,
        difficulty: r.difficulty,
        crystal: BigInt(r.crystal || 0) / BigInt(r.party),
      });
      for (const id of rules[r.name + '|' + r.difficulty] || []) {
        const from = sources.get(id) || new Set<string>();
        from.add(`${r.difficulty} ${r.name}`);
        sources.set(id, from);
      }
    }
  const drops = items
    .filter((item) => sources.has(item.id) && hasEpicBeam(item.name))
    .map((item) => ({ ...item, from: [...sources.get(item.id)!] }))
    .sort((a, b) => rankOf(a.name) - rankOf(b.name))
    .slice(0, DROP_LIMIT);
  return {
    bosses,
    crystal: bosses.reduce((sum, b) => sum + b.crystal, 0n),
    drops,
  };
}
