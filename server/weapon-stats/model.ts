import { z } from 'zod';
import type { WeaponStatsCounts } from '@/contracts/weapon-stats/schema';
import { jobWeaponStat } from '@/lib/weapon-stats/job-stat';

const weaponSchema = z.object({
  item_equipment_slot: z.string(),
  item_name: z.string(),
  additional_potential_option_1: z.string().nullish(),
  additional_potential_option_2: z.string().nullish(),
  additional_potential_option_3: z.string().nullish(),
});
const equipmentSchema = z
  .object({
    preset_no: z.number().nullish(),
    item_equipment: z.array(weaponSchema).nullish(),
    item_equipment_preset_1: z.array(weaponSchema).nullish(),
    item_equipment_preset_2: z.array(weaponSchema).nullish(),
    item_equipment_preset_3: z.array(weaponSchema).nullish(),
  })
  .refine(
    (data) =>
      Array.isArray(data.item_equipment) ||
      [
        data.item_equipment_preset_1,
        data.item_equipment_preset_2,
        data.item_equipment_preset_3,
      ].some(Array.isArray),
  );

export type WeaponResult = {
  weapon: 'genesis' | 'destiny';
  triple: 'attack' | 'magic' | null;
};

const genesisRolls = new Set(['12/9/9', '12/12/9', '12/12/12']);

export function classifyWeapon(input: unknown, stage: number): WeaponResult | null {
  const equipment = equipmentSchema.parse(input);
  const presets = [
    equipment.item_equipment_preset_1,
    equipment.item_equipment_preset_2,
    equipment.item_equipment_preset_3,
  ];
  const active = equipment.item_equipment ?? presets[(equipment.preset_no ?? 0) - 1];
  if (!active) throw new Error('장착 프리셋을 확인할 수 없어요.');
  const main = active.find((item) => item.item_equipment_slot === '무기');
  if (!main) return null;

  const weapon = main.item_name.startsWith('데스티니 ')
    ? 'destiny'
    : main.item_name.startsWith('제네시스 ')
      ? 'genesis'
      : null;
  if (!weapon || stage < 1 || (weapon === 'destiny' && stage < 2)) return null;

  const options = [
    main.additional_potential_option_1,
    main.additional_potential_option_2,
    main.additional_potential_option_3,
  ].map((line) => /^(공격력|마력)\s*\+(\d+)%$/.exec(line?.trim() ?? ''));
  const stat = options[0]?.[1];
  if (!stat || !options.every((line) => line?.[1] === stat)) return { weapon, triple: null };

  const values = options
    .map((line) => Number(line?.[2]))
    .sort((a, b) => b - a)
    .join('/');
  return {
    weapon,
    triple:
      weapon === 'genesis' && !genesisRolls.has(values)
        ? null
        : stat === '공격력'
          ? 'attack'
          : 'magic',
  };
}

export type CharacterResult = {
  job: string;
  stage: number | null;
  result: WeaponResult | null;
};

export function aggregateWeaponStats(characters: Iterable<CharacterResult>) {
  const empty = (): WeaponStatsCounts => ({
    ranked: 0,
    checked: 0,
    liberated: 0,
    genesis: 0,
    destiny: 0,
    attack: 0,
    magic: 0,
  });
  const totals = empty();
  const jobs = new Map<string, WeaponStatsCounts>();

  for (const { job, stage, result } of characters) {
    const jobCounts = jobs.get(job) ?? empty();
    jobs.set(job, jobCounts);
    for (const counts of [totals, jobCounts]) {
      counts.ranked++;
      if (stage === null) continue;
      counts.checked++;
      if (stage === 0) continue;
      counts.liberated++;
      if (!result) continue;
      counts[result.weapon]++;
      if (result.triple === jobWeaponStat(job)) counts[result.triple]++;
    }
  }

  return {
    totals,
    jobs: Array.from(jobs, ([job, counts]) => ({ job, ...counts })).sort(
      (a, b) => b.genesis + b.destiny - a.genesis - a.destiny || a.job.localeCompare(b.job, 'ko'),
    ),
  };
}
