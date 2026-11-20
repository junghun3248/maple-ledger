import { z } from 'zod';
import { nexonCharacterSchema } from '@/contracts/boss/nexon';

/** 넥슨 character/hexamatrix의 장착 코어 한 개를 계산기에 필요한 값만 남긴 형태 */
/** 넥슨 Open API 정적 이미지 주소만 허용한다. */
export const hexaIconPattern =
  /^https:\/\/open\.api\.nexon\.com\/static\/maplestory\/[A-Za-z0-9/_.-]+$/;

export const hexaCoreSchema = z.object({
  name: z.string().min(1).max(80),
  level: z.number().int().min(0).max(30),
  type: z.string().max(40),
  // 넥슨 6차 스킬 목록에서 찾은 아이콘(open.api.nexon.com 정적 이미지만 허용). 못 찾으면 비어 있다.
  icon: z.string().regex(hexaIconPattern).optional(),
});
export type HexaCore = z.infer<typeof hexaCoreSchema>;

export const hexaResponseSchema = z.object({ cores: z.array(hexaCoreSchema).max(60) });
export type HexaResponse = z.infer<typeof hexaResponseSchema>;

/** 닉네임 검색(사이트 키) 결과: 캐릭터 기본 정보와 코어 */
export const hexaSearchResponseSchema = hexaResponseSchema.extend({
  character: nexonCharacterSchema.omit({ combatPower: true }),
});
export type HexaSearchResponse = z.infer<typeof hexaSearchResponseSchema>;
