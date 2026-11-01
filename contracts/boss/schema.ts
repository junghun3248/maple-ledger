import { z } from 'zod';
const amount = z.string().regex(/^\d{1,15}$/);
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => !Number.isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v);
export const dropSchema = z.object({
  id: z.string().min(1).max(80),
  name: z.string().min(1).max(80),
  icon: z.string().refine((v) => v === '' || /^\/boss-icons\/item-\d+\.png$/.test(v)),
  selected: z.boolean(),
  qty: z.number().int().min(1).max(99),
  price: z.union([amount, z.literal('')]),
});
export const runSchema = z.object({
  id: z.string().min(1).max(80),
  name: z.string().min(1).max(60),
  difficulty: z.string().min(1).max(20),
  period: z.enum(['week', 'month']),
  date,
  party: z.number().int().min(1).max(6),
  crystal: amount,
  fee: z.number().int().min(0).max(10000),
  cleared: z.boolean(),
  drops: z
    .array(dropSchema)
    .max(50)
    .refine((rows) => new Set(rows.map((r) => r.id)).size === rows.length),
});
export const profileSchema = z.object({
  world: z.string().min(1).max(40),
  job: z.string().min(1).max(60),
  level: z.number().int().min(1).max(300),
  image: z
    .string()
    .max(5000)
    .refine(
      (v) => v === '' || /^https:\/\/avatar\.maplestory\.nexon\.com\/[A-Za-z0-9/_.?=&%-]+$/.test(v),
    ),
  checkedAt: z.string().min(1).max(40),
});
export const characterSchema = z.object({
  id: z.string().min(1).max(80),
  name: z.string().min(1).max(40),
  nexonId: z
    .string()
    .regex(/^\w{16,128}$/)
    .optional(),
  profile: profileSchema.optional(),
  runs: z.array(runSchema).max(200),
});
export const rosterSchema = z.object({
  name: z.string().min(1).max(60),
  bossId: z.string().regex(/^boss-\d+$/),
  party: z.number().int().min(1).max(6),
});
export const bossStateSchema = z
  .object({
    characters: z.array(characterSchema).max(36),
    presets: z
      .array(
        z.object({
          name: z.string().min(1).max(40),
          selection: z
            .array(rosterSchema)
            .max(12)
            .refine((rows) => new Set(rows.map((r) => r.name)).size === rows.length),
        }),
      )
      .max(20)
      .optional(),
  })
  .refine((s) => {
    const ids = s.characters.flatMap((c) => [c.id, ...c.runs.map((r) => r.id)]);
    return (
      new Set(ids).size === ids.length &&
      s.characters.reduce((n, c) => n + c.runs.length, 0) <= 1000
    );
  });
export const bossResponseSchema = z.object({
  name: z.string(),
  state: bossStateSchema,
  revision: z.number().int(),
});
