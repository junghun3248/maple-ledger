import type { BossState, ItemDefinition } from '@/contracts/boss/state';
import { boardRuns, weekKey } from './model';

/** 주간 보스는 목요일 0시(KST)에 초기화되므로 수요일이 이번 주 마지막 날이다. */
export const isResetEve = (today: string) => new Date(today + 'T00:00:00Z').getUTCDay() === 3;

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
  // 알림에는 물욕템을 보여 준다. 남은 보스에 물욕템이 없으면(노멀 대적자 등) 연마석을 대신 보여 주고,
  // 소울 에테르는 보여 주지 않는다.
  const possible = items
    .filter((item) => sources.has(item.id) && !/소울 에테르/.test(item.name))
    .map((item) => ({ ...item, from: [...sources.get(item.id)!] }));
  const rare = possible.filter((item) => !/연마석/.test(item.name));
  const drops = rare.length ? rare : possible;
  return {
    bosses,
    crystal: bosses.reduce((sum, b) => sum + b.crystal, 0n),
    drops,
  };
}
