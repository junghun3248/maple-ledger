import { z } from 'zod';
export const visitRequestSchema = z.object({ visitor: z.string().uuid() });
export const visitResponseSchema = z.object({
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  count: z.number().int().nonnegative(),
});
