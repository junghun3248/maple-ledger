import { weekKey } from './model';
import type { Run, BossDefinition, BossState } from '@/contracts/boss/state';
import { validState } from './model';
export interface SchedulerRow {
  name: string;
  difficulty: string;
  cycle: string;
  registered: boolean;
  complete?: boolean;
  order?: number;
}
export type SchedulerBoss = BossDefinition & { complete?: boolean };
export interface ImportDraft {
  chosen: { ocid: string; name: string; world: string; job: string; level: number };
  selection: { selected: SchedulerBoss[]; unknown: string[] };
  date: string;
}
const difficulties: Record<string, string> = {
  easy: '이지',
  normal: '노멀',
  hard: '하드',
  chaos: '카오스',
  extreme: '익스트림',
};
const normalize = (s: string) => String(s).replace(/\s/g, '');
export function schedulerSelection(rows: SchedulerRow[], catalog: BossDefinition[]) {
  const selected: SchedulerBoss[] = [],
    unknown: string[] = [];
  for (const r of rows
    .filter((r) => r.registered && ['bossWeekly', 'bossMonthly'].includes(r.cycle))
    .sort((a, b) => (a.order || 0) - (b.order || 0))) {
    const difficulty = difficulties[r.difficulty] || r.difficulty;
    const boss = catalog.find(
      (b) =>
        b.period === (r.cycle === 'bossMonthly' ? 'month' : 'week') &&
        normalize(b.name) === normalize(r.name) &&
        b.difficulty === difficulty,
    );
    if (boss) selected.push({ ...boss, complete: r.complete });
    else unknown.push(r.name + ' · ' + difficulty);
  }
  return { selected, unknown };
}
export function mergeScheduler(
  runs: Run[],
  selection: SchedulerBoss[],
  date: string,
  newId: () => string,
) {
  const next = structuredClone(runs),
    conflicts: string[] = [];
  let added = 0;
  for (const b of selection) {
    const old = next.find(
      (r) =>
        r.period === b.period &&
        r.name === b.name &&
        (b.period === 'month'
          ? r.date.slice(0, 7) === date.slice(0, 7)
          : weekKey(r.date) === weekKey(date)),
    );
    if (old) {
      if (old.difficulty !== b.difficulty) conflicts.push(b.name);
      else if (b.complete !== undefined) old.cleared = b.complete;
      continue;
    }
    const prior = [...runs]
      .reverse()
      .find((r) => r.name === b.name && r.difficulty === b.difficulty);
    next.push({
      id: newId(),
      name: b.name,
      difficulty: b.difficulty,
      period: b.period,
      date,
      party: prior?.party || 1,
      crystal: String(b.price),
      fee: prior?.fee ?? 500,
      cleared: b.complete ?? false,
      drops: [],
    });
    added++;
  }
  return { runs: next, added, conflicts };
}

export const eligibleCharacter = (c: { combatPower?: number }) =>
  Number.isSafeInteger(c.combatPower) && (c.combatPower ?? 0) > 10000000;
export function mergeCharacterBatch(
  state: BossState,
  drafts: ImportDraft[],
  makeId: () => string = () => crypto.randomUUID(),
) {
  const candidate = structuredClone(state),
    ids = [];
  let added = 0,
    conflicts = 0;
  for (const { chosen, selection, date } of drafts) {
    const c =
      candidate.characters.find((c) => c.nexonId === chosen.ocid) ||
      candidate.characters.find(
        (c) => c.name === chosen.name && (!c.profile || c.profile.world === chosen.world),
      );
    const merged = mergeScheduler(c?.runs || [], selection.selected, date, makeId);
    const updated = {
      ...(c || { id: makeId(), name: chosen.name }),
      nexonId: chosen.ocid,
      profile: {
        world: chosen.world,
        job: chosen.job.trim(),
        level: chosen.level,
        image: c?.profile?.image || '',
        checkedAt: new Date().toISOString(),
      },
      runs: merged.runs,
    };
    if (c) candidate.characters[candidate.characters.indexOf(c)] = updated;
    else candidate.characters.push(updated);
    ids.push(updated.id);
    added += merged.added;
    conflicts += merged.conflicts.length;
  }
  if (!validState(candidate))
    throw Error(
      '추가하면 저장 가능한 캐릭터·보스 기록 수를 넘거나 정보 형식이 맞지 않아요. 기존 기록은 변경하지 않았어요.',
    );
  return { state: candidate, ids, added, conflicts };
}
