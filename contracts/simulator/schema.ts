import { z } from 'zod';
export const probabilityRequest = z.object({
  mode: z.enum(['potential', 'additional']),
  level: z.number().int().min(1).max(250),
  part: z.number().int().min(1).max(20),
  grade: z.number().int().min(1).max(4),
});
export const optionSchema = z.object({
  text: z.string().min(1).max(300),
  weight: z.number().positive().max(100),
});
export const tablesSchema = z.array(z.array(optionSchema).min(1)).length(3);
export type Option = z.infer<typeof optionSchema>;
export type Tables = z.infer<typeof tablesSchema>;
export type Mode = 'potential' | 'additional';

export const equipmentSchema = z.object({
  name: z.string(),
  slot: z.string(),
  icon: z.string(),
  level: z.number().int().min(1).max(250),
  part: z.number().int().min(1).max(20),
  stars: z.number().int().min(0).max(30),
  starUnsupported: z.string().optional(),
  potentialGrade: z.number().int().min(0).max(4),
  additionalGrade: z.number().int().min(0).max(4),
  potential: z.array(z.string()).length(3),
  additional: z.array(z.string()).length(3),
});
export const equipmentResponse = z.object({ equipment: z.array(equipmentSchema) });
export type Equipment = z.infer<typeof equipmentSchema>;
export const equipmentRequest = z.object({
  apiKey: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9_-]{32,256}$/),
  nickname: z
    .string()
    .trim()
    .regex(/^[가-힣a-zA-Z0-9]{2,12}$/),
});
