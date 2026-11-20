import { z } from 'zod';

/** 넥슨 character/hexamatrix의 장착 코어 한 개를 계산기에 필요한 값만 남긴 형태 */
export const hexaCoreSchema = z.object({
  name: z.string().min(1).max(80),
  level: z.number().int().min(0).max(30),
  type: z.string().max(40),
});
export type HexaCore = z.infer<typeof hexaCoreSchema>;

export const hexaResponseSchema = z.object({ cores: z.array(hexaCoreSchema).max(60) });
export type HexaResponse = z.infer<typeof hexaResponseSchema>;
