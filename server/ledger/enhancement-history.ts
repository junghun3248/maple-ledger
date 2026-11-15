import { z } from 'zod';
import {
  enhancementLevelQuerySchema,
  enhancementQuerySchema,
  enhancementResponseSchema,
  type EnhancementRow,
} from '@/contracts/ledger/enhancement-schema';
import { koreaDate } from '@/lib/ledger/korea-date';
import { NexonError, nexonReader } from './nexon-client';
import { json } from './response';

// 넥슨 확률형 이력 API(history/starforce, history/potential)를 비용 계산용 행으로 정규화한다.
// Codex의 강화 이력 지출 작업(2026-11-11)을 옮겨 왔다.
export const ENHANCEMENT_FROM = '2026-10-22';

const rawRow = z
  .object({
    id: z.string(),
    date_create: z.string(),
    target_item: z.string(),
    character_name: z.string(),
  })
  .catchall(z.unknown());
const grades = ['레어', '에픽', '유니크', '레전드리'];
// API는 '0'/'1' 또는 '파괴 방지 미적용' 같은 설명형 문자열로 조건을 돌려준다.
const off = (v: unknown) =>
  v === undefined ||
  v === null ||
  v === '' ||
  v === '0' ||
  (typeof v === 'string' && /(?:^| )(?:미적용|미사용|미해당|없음)$/.test(v));
const flag = (v: unknown) =>
  !off(v) && (v === '1' || (typeof v === 'string' && /(?:^| )(?:적용|사용)$/.test(v)));
function eventApplies(value: string, stars: number) {
  const range = /^(\d+)\s*~\s*(\d+)$/.exec(value.trim());
  if (range && Number(range[1]) <= Number(range[2]))
    return stars >= Number(range[1]) && stars <= Number(range[2]);
  if (/^\d+(?:\s*,\s*\d+)*$/.test(value.trim()))
    return value.split(',').map(Number).includes(stars);
  return null;
}
const eventList = z.array(
  z.object({
    cost_discount_rate: z.union([z.string(), z.number()]).nullish(),
    starforce_event_range: z.string().nullish(),
  }),
);

function normalizePotential(r: z.infer<typeof rawRow>, row: EnhancementRow) {
  row.level = typeof r.item_level === 'number' ? r.item_level : undefined;
  row.additional = r.potential_type === '에디셔널 잠재능력';
  const options = z
    .array(z.object({ grade: z.string() }))
    .safeParse(row.additional ? r.before_additional_potential_option : r.before_potential_option);
  const after = z
    .array(z.unknown())
    .safeParse(row.additional ? r.after_additional_potential_option : r.after_potential_option);
  // 비용은 재설정 '전' 등급으로 정해진다. 결과 옵션 3개는 1회, 9개는 3회(한 번에 3번) 재설정이다.
  const grade = options.success ? grades.indexOf(options.data[0]?.grade) + 1 : 0;
  row.grade = grade || undefined;
  if (
    !['잠재능력', '에디셔널 잠재능력'].includes(String(r.potential_type)) ||
    !row.level ||
    !grade ||
    !after.success ||
    ![3, 9].includes(after.data.length)
  )
    row.excluded = '재설정 전 등급·레벨·횟수를 확인할 수 없음';
  else row.rolls = after.data.length / 3;
}

function normalizeStarforce(r: z.infer<typeof rawRow>, row: EnhancementRow) {
  const stars = r.before_starforce_count;
  if (typeof stars === 'number' && Number.isInteger(stars) && stars >= 0 && stars < 30)
    row.stars = stars;
  row.safeguard = flag(r.destroy_defence);
  row.discount = 0;
  if (
    /복구|전승|토드/.test(String(r.item_upgrade_result)) ||
    /라피스|라즐리/.test(r.target_item) ||
    !off(r.superior_item_flag) ||
    !off(r.upgrade_item) ||
    !off(r.protect_shield) ||
    !off(r.event_field_flag) ||
    row.stars === undefined ||
    (!flag(r.destroy_defence) && !off(r.destroy_defence))
  )
    row.excluded = '슈페리얼·특수 재화·특수 강화 또는 확인할 수 없는 조건';
  const events = eventList.safeParse(r.starforce_event_list ?? []);
  if (!events.success) {
    row.excluded = '이벤트 할인 조건을 확인할 수 없음';
    return;
  }
  for (const event of events.data) {
    const rate = String(event.cost_discount_rate ?? '').trim();
    if (!rate || rate === '0%' || rate === '0') continue;
    const match = /^(\d+(?:\.\d+)?)%?$/.exec(rate);
    const applies =
      row.stars === undefined ? null : eventApplies(event.starforce_event_range || '', row.stars);
    if (!match || applies === null || Number(match[1]) > 100)
      row.excluded = '이벤트 할인 적용 범위를 확인할 수 없음';
    else if (applies) row.discount = Math.max(row.discount, Number(match[1]) / 100);
  }
}

export function normalizeEnhancement(
  value: unknown,
  kind: 'starforce' | 'potential',
): EnhancementRow {
  const r = rawRow.parse(value);
  const row: EnhancementRow = {
    id: r.id,
    at: r.date_create,
    item: r.target_item,
    character: r.character_name,
    kind,
  };
  if (kind === 'potential') normalizePotential(r, row);
  else normalizeStarforce(r, row);
  return row;
}

const failure = (e: unknown) =>
  json(
    {
      error:
        e instanceof NexonError
          ? e.message
          : '강화 이력을 읽지 못했어요. API 권한을 확인하고 다시 시도해 주세요.',
    },
    e instanceof NexonError ? e.status : 502,
  );

/** 하루치 강화 이력 한 페이지를 읽는다. 키는 응답에 포함하지 않는다. */
export async function enhancementHistory(body: unknown) {
  const parsed = enhancementQuerySchema.safeParse(body);
  if (!parsed.success) return json({ error: 'API 키와 조회 날짜를 확인해 주세요.' }, 400);
  const { key, date, kind, cursor } = parsed.data;
  if (date < ENHANCEMENT_FROM || date > koreaDate())
    return json({ error: `현재 비용표는 ${ENHANCEMENT_FROM} 이후 기록을 지원합니다.` }, 400);
  try {
    const query = new URLSearchParams({ count: '100', ...(cursor ? { cursor } : { date }) });
    const response = await nexonReader(key)(`history/${kind}?${query}`);
    const page = z
      .object({
        next_cursor: z.string().nullish(),
        [kind + '_history']: z.array(z.unknown()).max(1000).nullable(),
      })
      .parse(response);
    const records = (page[kind + '_history'] ?? []) as unknown[];
    const rows = records
      .map((r) => normalizeEnhancement(r, kind))
      .filter((r) => koreaDate(Date.parse(r.at)) === date);
    return json(enhancementResponseSchema.parse({ rows, cursor: page.next_cursor || '' }));
  } catch (e) {
    return failure(e);
  }
}

const equipmentSchema = z
  .object({
    item_name: z.string(),
    item_base_option: z.object({ base_equipment_level: z.number().int() }).nullish(),
  })
  .passthrough();
const equipmentResponse = z
  .object({ item_equipment: z.array(equipmentSchema).nullish() })
  .catchall(z.unknown());

/** 캐릭터의 현재 장착·프리셋 장비에서 아이템 이름별 레벨을 찾는다. 찾지 못한 장비는 화면에서 직접 입력한다. */
export async function enhancementLevels(body: unknown) {
  const parsed = enhancementLevelQuerySchema.safeParse(body);
  if (!parsed.success) return json({ error: 'API 키와 캐릭터를 확인해 주세요.' }, 400);
  const read = nexonReader(parsed.data.key);
  const levels: Record<string, number> = {};
  try {
    for (const name of new Set(parsed.data.characters)) {
      const id = z
        .object({ ocid: z.string().regex(/^\w{16,128}$/) })
        .safeParse(await read('id?character_name=' + encodeURIComponent(name)));
      if (!id.success) continue;
      const data = equipmentResponse.parse(
        await read('character/item-equipment?ocid=' + encodeURIComponent(id.data.ocid)),
      );
      const lists = [
        data.item_equipment,
        ...[1, 2, 3].map((n) => data[`item_equipment_preset_${n}`]),
      ];
      for (const list of lists) {
        const items = z.array(equipmentSchema).safeParse(list ?? []);
        if (!items.success) continue;
        for (const item of items.data) {
          const level = item.item_base_option?.base_equipment_level;
          if (level && level >= 1 && level <= 250 && !levels[item.item_name])
            levels[item.item_name] = level;
        }
      }
    }
    return json({ levels });
  } catch (e) {
    return failure(e);
  }
}
