import { z } from 'zod';
import { characterImageSchema } from './schema';
export const nexonCharacterSchema = z.object({
  ocid: z.string(),
  name: z.string(),
  world: z.string(),
  job: z.string(),
  level: z.number(),
  image: characterImageSchema.optional(),
  combatPower: z.number().optional(),
});
export type NexonCharacter = z.infer<typeof nexonCharacterSchema>;
export const schedulerSchema = z.object({
  ocid: z.string(),
  date: z.string().nullable().optional(),
  error: z.string().optional(),
  image: characterImageSchema.optional(),
  bosses: z
    .array(
      z.object({
        name: z.string(),
        difficulty: z.string(),
        cycle: z.string(),
        registered: z.boolean(),
        complete: z.boolean().optional(),
        order: z.number().optional(),
      }),
    )
    .optional(),
});
