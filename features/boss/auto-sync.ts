import type { BossDefinition, BossState } from '@/contracts/boss/state';
import { boardRuns, validState } from './model';
import { applyApiClear, mergeScheduler, schedulerSelection, type SchedulerRow } from './scheduler';

// 넥슨 스케줄러는 보스 완료 시점에 갱신된다. 재방문마다 호출하지 않도록 최소 간격을 둔다.
export const AUTO_SYNC_INTERVAL_MS = 10 * 60 * 1000;
export const NEXON_KEY_STORAGE = 'maple-boss-nexon-api-key';
export const syncTimeKey = (book: string | null) => 'maple-boss-sync-at:' + (book ?? '');

export interface SyncResponse {
  ocid: string;
  date?: string | null;
  error?: string;
  bosses?: SchedulerRow[];
}

export function syncTargets(state: BossState) {
  return [...new Set(state.characters.flatMap((c) => (c.nexonId ? [c.nexonId] : [])))];
}

export function shouldAutoSync(lastSync: number | null, now: number) {
  return lastSync === null || now - lastSync >= AUTO_SYNC_INTERVAL_MS;
}

/**
 * 스케줄러 응답을 정산표에 반영한다.
 * - 이번 주기에 기록이 있으면 같은 보스·난이도의 클리어 여부만 갱신한다.
 * - 이번 주기에 기록이 하나도 없으면 스케줄러에 등록된 보스를 새로 추가한다.
 * - 조회 실패한 캐릭터와 수동으로 바꾼 클리어 기록은 그대로 둔다.
 */
export function applySync(
  state: BossState,
  responses: SyncResponse[],
  catalog: BossDefinition[],
  today: string,
  newId: () => string = () => crypto.randomUUID(),
) {
  const run = (addMissing: boolean) => {
    const next = structuredClone(state);
    let updated = 0,
      added = 0;
    const failed: string[] = [];
    for (const character of next.characters) {
      if (!character.nexonId) continue;
      const response = responses.find((r) => r.ocid === character.nexonId);
      if (!response) continue;
      if (response.error || !response.bosses) {
        failed.push(character.name);
        continue;
      }
      const date = response.date?.slice(0, 10) || today;
      const { selected } = schedulerSelection(response.bosses, catalog);
      for (const period of ['week', 'month'] as const) {
        const rows = selected.filter((b) => b.period === period);
        if (!rows.length) continue;
        const current = boardRuns(character, date, period);
        if (!current.length) {
          if (!addMissing) continue;
          const merged = mergeScheduler(character.runs, rows, date, newId);
          character.runs = merged.runs;
          added += merged.added;
          continue;
        }
        for (const boss of rows) {
          const existing = current.find(
            (r) => r.name === boss.name && r.difficulty === boss.difficulty,
          );
          if (existing && applyApiClear(existing, boss.complete)) updated++;
        }
      }
    }
    return { state: next, updated, added, failed };
  };
  const full = run(true);
  // 기록 수 한도를 넘으면 새 보스 추가는 건너뛰고 완료 표시만 반영한다.
  return validState(full.state) ? full : run(false);
}
