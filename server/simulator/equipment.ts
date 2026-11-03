import { z } from 'zod';
import { equipmentRequest, equipmentResponse } from '@/contracts/simulator/schema';
const nullableText = z.string().nullable().optional();
const item = z.object({
  item_name: z.string(),
  item_equipment_slot: z.string(),
  item_equipment_part: z.string(),
  item_icon: z.string(),
  item_base_option: z.object({ base_equipment_level: z.number() }),
  starforce: z.string(),
  starforce_scroll_flag: nullableText,
  potential_option_grade: nullableText,
  additional_potential_option_grade: nullableText,
  potential_option_1: nullableText,
  potential_option_2: nullableText,
  potential_option_3: nullableText,
  additional_potential_option_1: nullableText,
  additional_potential_option_2: nullableText,
  additional_potential_option_3: nullableText,
});
const grade = (s?: string | null) =>
  Math.max(0, ['없음', '레어', '에픽', '유니크', '레전드리'].indexOf(s || '없음'));
const partNames: Record<string, number> = {
  무기: 1,
  엠블렘: 2,
  보조무기: 3,
  방패: 5,
  모자: 6,
  상의: 7,
  한벌옷: 8,
  하의: 9,
  신발: 10,
  장갑: 11,
  망토: 12,
  벨트: 13,
  어깨장식: 14,
  얼굴장식: 15,
  눈장식: 16,
  귀고리: 17,
  반지: 18,
  펜던트: 19,
  기계심장: 20,
};
export async function equipment(input: unknown) {
  const { apiKey, nickname } = equipmentRequest.parse(input);
  async function read(path: string) {
    const r = await fetch('https://open.api.nexon.com/maplestory/v1/' + path, {
      headers: { 'x-nxopen-api-key': apiKey },
      redirect: 'manual',
      cache: 'no-store',
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok)
      throw Error('넥슨 장비 조회에 실패했어요. API 키·닉네임과 최근 접속 여부를 확인해 주세요.');
    return r.json();
  }
  const { ocid } = z
    .object({ ocid: z.string().regex(/^\w{16,128}$/) })
    .parse(await read('id?character_name=' + encodeURIComponent(nickname)));
  const data = z
    .object({
      item_equipment: z.array(item),
      item_equipment_preset_1: z.array(item).nullish(),
      item_equipment_preset_2: z.array(item).nullish(),
      item_equipment_preset_3: z.array(item).nullish(),
    })
    .parse(await read('character/item-equipment?ocid=' + encodeURIComponent(ocid)));
  const convert = (items: z.infer<typeof item>[]) =>
    items.flatMap((i) => {
      const slot = i.item_equipment_slot.replace(/\d+$/, '');
      let part = partNames[i.item_equipment_part] || partNames[slot];
      if (/포스실드|소울링/.test(i.item_equipment_part)) part = 4;
      if (
        !part ||
        i.item_base_option.base_equipment_level < 1 ||
        i.item_base_option.base_equipment_level > 250
      )
        return [];
      const url = new URL(i.item_icon);
      return [
        {
          name: i.item_name,
          slot: i.item_equipment_slot,
          icon:
            url.protocol === 'https:' && url.hostname === 'open.api.nexon.com' ? i.item_icon : '',
          level: i.item_base_option.base_equipment_level,
          part,
          stars: Number(i.starforce),
          starUnsupported:
            i.starforce_scroll_flag === '사용' ||
            /타일런트|라피스|라즐리|데스티니|아스트라/.test(i.item_name)
              ? '특수 강화 장비는 현재 지원하지 않습니다.'
              : undefined,
          potentialGrade: grade(i.potential_option_grade),
          additionalGrade: grade(i.additional_potential_option_grade),
          potential: [
            i.potential_option_1 || '',
            i.potential_option_2 || '',
            i.potential_option_3 || '',
          ],
          additional: [
            i.additional_potential_option_1 || '',
            i.additional_potential_option_2 || '',
            i.additional_potential_option_3 || '',
          ],
        },
      ];
    });
  return equipmentResponse.parse({
    equipment: convert(data.item_equipment),
    presets: [
      data.item_equipment_preset_1,
      data.item_equipment_preset_2,
      data.item_equipment_preset_3,
    ].map((items, i) => ({ id: i + 1, equipment: convert(items || []) })),
  });
}
