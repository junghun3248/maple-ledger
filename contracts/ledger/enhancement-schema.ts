import { z } from 'zod';
import { ledgerRecordSchema } from './schema';

// 넥슨 API 키는 브라우저에만 저장하고 요청마다 서버를 거쳐 넥슨으로 전달한다. 서버에는 남기지 않는다.
const apiKey = z.string().regex(/^[A-Za-z0-9_-]{32,256}$/);
export const enhancementKinds = ['starforce', 'potential'] as const;
export const enhancementQuerySchema = z.object({
  key: apiKey,
  date: ledgerRecordSchema.shape.date,
  kind: z.enum(enhancementKinds),
  cursor: z.string().max(2048).optional(),
});
export const enhancementRowSchema = z.object({
  id: z.string().min(1).max(180),
  kind: z.enum(enhancementKinds),
  item: z.string().max(160),
  character: z.string().max(40),
  at: z.string().datetime({ offset: true }),
  level: z.number().int().min(1).max(250).optional(),
  stars: z.number().int().min(0).max(29).optional(),
  safeguard: z.boolean().optional(),
  discount: z.number().min(0).max(1).optional(),
  grade: z.number().int().min(1).max(4).optional(),
  additional: z.boolean().optional(),
  rolls: z.number().int().min(1).max(3).optional(),
  excluded: z.string().max(150).optional(),
});
export type EnhancementRow = z.infer<typeof enhancementRowSchema>;
export const enhancementResponseSchema = z.object({
  rows: z.array(enhancementRowSchema).max(1000),
  cursor: z.string().max(2048),
});

// 스타포스 이력에는 장비 레벨이 없어, 현재 장착 장비에서 같은 이름의 레벨을 찾아 채운다.
export const enhancementLevelQuerySchema = z.object({
  key: apiKey,
  characters: z.array(z.string().min(1).max(40)).min(1).max(10),
});
export const enhancementLevelResponseSchema = z.object({
  levels: z.record(z.string().max(160), z.number().int().min(1).max(250)),
});
