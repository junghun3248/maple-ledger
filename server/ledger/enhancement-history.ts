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
// 넥슨은 조건을 '0'/'1' 또는 '파괴 방지 미적용', '슈페리얼 장비 아님' 같은 설명형 문자열로 돌려준다.
// 형식을 모르는 값은 추측하지 않고, 어떤 값 때문에 빠졌는지 화면에 보여 준다.
type Flag = 'on' | 'off' | 'unknown';
function flagOf(v: unknown): Flag {
  if (v === undefined || v === null || v === false || v === '' || v === 0) return 'off';
  if (v === true || v === 1) return 'on';
  const text = String(v).trim();
  if (/^(?:0|false|n|no)$/i.test(text)) return 'off';
  if (/^(?:1|true|y|yes)$/i.test(text)) return 'on';
  if (/(?:미적용|미사용|미해당|아님|없음|않음|불가|해당\s*없음)$/.test(text)) return 'off';
  if (/(?:적용|사용|해당|장비)$/.test(text)) return 'on';
  return 'unknown';
}
const shown = (field: string, v: unknown) => `${field}: ${String(v).slice(0, 40)}`;

/** 이벤트 적용 범위. '0~29', '10-22', '0,1,2', '15성', '전체' 형식을 받는다. 모르면 null */
export function eventApplies(value: string, stars: number) {
  const text = value.replace(/성|\s/g, '');
  if (!text || /^(?:전체|모든|all)$/i.test(text)) return true;
  const range = /^(\d+)[~-](\d+)$/.exec(text);
  if (range && Number(range[1]) <= Number(range[2]))
    return stars >= Number(range[1]) && stars <= Number(range[2]);
  if (/^\d+(?:,\d+)*$/.test(text)) return text.split(',').map(Number).includes(stars);
  return null;
}
const eventList = z.array(
  z
    .object({
      cost_discount_rate: z.union([z.string(), z.number()]).nullish(),
      starforce_event_range: z.union([z.string(), z.number()]).nullish(),
    })
    .passthrough(),
);

function normalizePotential(r: z.infer<typeof rawRow>, row: EnhancementRow) {
  const type = String(r.potential_type ?? '');
  row.level = typeof r.item_level === 'number' ? r.item_level : undefined;
  row.additional = type.includes('에디셔널');
  if (!type.includes('잠재')) {
    row.excluded = '잠재능력 재설정이 아님 · ' + shown('potential_type', type);
    return;
  }
  const options = z
    .array(z.object({ grade: z.string() }).passthrough())
    .safeParse(row.additional ? r.before_additional_potential_option : r.before_potential_option);
  const after = z
    .array(z.unknown())
    .safeParse(row.additional ? r.after_additional_potential_option : r.after_potential_option);
  // 비용은 재설정 '전' 등급으로 정해진다. 결과 옵션 3줄 이하는 1회, 6줄·9줄은 2·3회로 본다.
  const before = options.success ? options.data[0]?.grade : undefined;
  const grade = before ? grades.indexOf(before.replace(/\s/g, '')) + 1 : 0;
  row.grade = grade || undefined;
  const lines = after.success ? after.data.length : 0;
  if (!row.level) row.excluded = '장비 레벨 없음';
  else if (!grade) row.excluded = '재설정 전 등급 확인 불가 · ' + shown('등급', before ?? '없음');
  else if (lines >= 1 && lines <= 3) row.rolls = 1;
  else if (lines === 6 || lines === 9) row.rolls = lines / 3;
  else row.excluded = `재설정 결과 옵션 수 확인 불가 · ${lines}줄`;
}

function normalizeStarforce(r: z.infer<typeof rawRow>, row: EnhancementRow) {
  const stars = r.before_starforce_count;
  if (typeof stars === 'number' && Number.isInteger(stars) && stars >= 0 && stars < 30)
    row.stars = stars;
  row.discount = 0;
  const reasons: string[] = [];
  if (row.stars === undefined) reasons.push(shown('강화 전 별 수', stars));
  if (/복구|전승/.test(String(r.item_upgrade_result ?? '')))
    reasons.push(shown('결과', r.item_upgrade_result));
  if (/라피스|라즐리/.test(r.target_item)) reasons.push('제로 무기');
  const superior = flagOf(r.superior_item_flag);
  if (superior !== 'off') reasons.push(shown('슈페리얼', r.superior_item_flag));
  // 주문서·특수 재화 강화는 메소 비용이 아니다. 값이 '미사용'류이거나 비어 있으면 일반 강화다.
  if (flagOf(r.upgrade_item) !== 'off') reasons.push(shown('주문서·특수 재화', r.upgrade_item));
  const shield = flagOf(r.protect_shield);
  if (shield !== 'off') reasons.push(shown('프로텍트 실드', r.protect_shield));
  const defence = flagOf(r.destroy_defence);
  if (defence === 'unknown') reasons.push(shown('파괴 방지', r.destroy_defence));
  row.safeguard = defence === 'on';
  const events = eventList.safeParse(r.starforce_event_list ?? []);
  if (!events.success) reasons.push('이벤트 정보 형식 확인 불가');
  else
    for (const event of events.data) {
      const rate = String(event.cost_discount_rate ?? '')
        .replace(/\s/g, '')
        .replace(/%$/, '');
      if (!rate || /^0+(?:\.0+)?$/.test(rate)) continue;
      const percent = /^\d+(?:\.\d+)?$/.test(rate) ? Number(rate) : NaN;
      const applies =
        row.stars === undefined
          ? null
          : eventApplies(String(event.starforce_event_range ?? ''), row.stars);
      if (!(percent >= 0 && percent <= 100) || applies === null)
        reasons.push(
          `이벤트 할인 ${String(event.cost_discount_rate).slice(0, 10)} · 범위 ${String(event.starforce_event_range).slice(0, 30)}`,
        );
      else if (applies) row.discount = Math.max(row.discount, percent / 100);
    }
  if (reasons.length) row.excluded = reasons.join(' / ').slice(0, 150);
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
