import { z } from 'zod';

const count = z.number().int().nonnegative();
export const weaponStatsCounts = z.object({
  ranked: count,
  checked: count,
  liberated: count,
  genesis: count,
  destiny: count,
  attack: count,
  magic: count,
});
export const weaponStatsSnapshot = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  minLevel: count,
  pageLimit: count.nullable(),
  totals: weaponStatsCounts,
  jobs: z.array(weaponStatsCounts.extend({ job: z.string().min(1) })),
});
export type WeaponStatsCounts = z.infer<typeof weaponStatsCounts>;
export type WeaponStatsSnapshot = z.infer<typeof weaponStatsSnapshot>;
