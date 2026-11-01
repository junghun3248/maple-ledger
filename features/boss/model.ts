import type { Run, BossState, Character } from '@/contracts/boss/state';
import { bossStateSchema } from '@/contracts/boss/schema';
import { dateKey } from '@/lib/ledger/format';
export { dateKey, money } from '@/lib/ledger/format';
export function weekKey(date: string) {
  const d = new Date(date + 'T12:00:00');
  d.setDate(d.getDate() - ((d.getDay() + 3) % 7));
  return dateKey(d);
}
export function settle(run: Run) {
  const party = BigInt(run.party),
    crystal = BigInt(run.crystal || 0) / party;
  let loot = 0n,
    remainder = 0n,
    missing = 0;
  for (const item of run.drops.filter((d) => d.selected)) {
    if (!item.price) {
      missing++;
      continue;
    }
    const gross = BigInt(item.price) * BigInt(item.qty),
      net = (gross * (10000n - BigInt(run.fee))) / 10000n;
    loot += net / party;
    remainder += net % party;
  }
  return { crystal, loot, total: crystal + loot, remainder, missing };
}
export const validState = (s: unknown): s is BossState => bossStateSchema.safeParse(s).success;
export const sumRuns = (runs: Run[]) => runs.reduce((n, r) => n + settle(r).total, 0n);

export function boardRuns(character: Character, date: string, period: 'week' | 'month' = 'week') {
  return character.runs.filter(
    (r) =>
      r.period === period &&
      (period === 'month'
        ? r.date.slice(0, 7) === date.slice(0, 7)
        : weekKey(r.date) === weekKey(date)),
  );
}
export function visibleCharacters(characters: Character[], visible: string[] | null) {
  return characters.filter((c) => !visible || visible.includes(c.id));
}
