import type { Run } from '@/contracts/boss/state';
export interface RatioResult {
  id: string;
  name: string;
  difficulty: string;
  ratio: number | null;
  party: boolean;
  confident: boolean;
  text: string;
  preview: string;
}
const difficulties: Record<string, string> = {
  EASY: '이지',
  NORMAL: '노멀',
  HARD: '하드',
  CHAOS: '카오스',
  EXTREME: '익스트림',
  DESTINY: '데스티니',
  CHAMPION: '챔피언',
};
export function parseDifficulty(text: string) {
  const token = text.toUpperCase().replace(/[^A-Z]/g, '');
  return difficulties[token] || '';
}
export function parseRatio(text: string) {
  const party = /파티|party|[\[\]]/i.test(text);
  const matches = [...text.matchAll(/(\d+(?:[.,]\d+)?)\s*%/g)];
  const ratio = matches.length === 1 ? Number(matches[0][1].replace(',', '.')) : null;
  return { party, ratio: ratio !== null && ratio > 0 && ratio <= 1000000 ? ratio : null };
}
export function applyRatios(runs: Run[], rows: RatioResult[], selected: string[], minutes: number) {
  if (!Number.isFinite(minutes) || minutes < 0.1 || minutes > 120)
    throw Error('기준 시간을 확인해 주세요.');
  const chosen = rows.filter(
    (r) =>
      selected.includes(r.id) &&
      !r.party &&
      r.ratio !== null &&
      r.ratio > 0 &&
      r.ratio <= 1000000 &&
      r.difficulty,
  );
  const keys = chosen.map((r) => r.name + '|' + r.difficulty);
  if (new Set(keys).size !== keys.length)
    throw Error('같은 보스·난이도가 중복 선택됐어요. 하나만 선택해 주세요.');
  return runs.map((run) => {
    const row = chosen.find((r) => r.name === run.name && r.difficulty === run.difficulty);
    return row ? { ...run, soloRatio: row.ratio!, ratioMinutes: minutes } : run;
  });
}
