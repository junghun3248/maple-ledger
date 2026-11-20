import { z } from 'zod';
import { characterImageSchema } from '@/contracts/boss/schema';
import {
  hexaIconPattern,
  hexaResponseSchema,
  hexaSearchResponseSchema,
  type HexaResponse,
} from '@/contracts/hexa/schema';
import { NexonError, nexonReader } from './nexon-client';
const ocidSchema = z.string().regex(/^\w{16,128}$/);
const validOcid = (id: unknown): id is string => ocidSchema.safeParse(id).success;
const schedulerSchema = z.object({
  character_name: z.string().optional(),
  world_name: z.string().optional(),
  date: z.string().nullable().optional(),
  boss_contents: z.array(
    z.object({
      content_name: z.string(),
      difficulty: z.string(),
      cycle: z.string(),
      registration_flag: z.union([z.boolean(), z.string()]).optional(),
      complete_flag: z.union([z.boolean(), z.string()]).optional(),
      clear_flag: z.union([z.boolean(), z.string()]).optional(),
      list_order_no: z.number().optional(),
    }),
  ),
});
const characterListSchema = z.object({
  account_list: z.array(
    z.object({
      character_list: z
        .array(
          z.object({
            ocid: ocidSchema,
            character_name: z.string(),
            world_name: z.string(),
            character_class: z.string(),
            character_level: z.number().int(),
          }),
        )
        .optional()
        .default([]),
    }),
  ),
});
const json = (v: unknown, status = 200) =>
  Response.json(v, { status, headers: { 'Cache-Control': 'no-store' } });
function scheduler(input: unknown) {
  const data = schedulerSchema.parse(input);
  if (!Array.isArray(data.boss_contents))
    throw Error('스케줄러 데이터가 없어요. 게임 접속 후 다시 시도해 주세요.');
  return {
    name: data.character_name,
    world: data.world_name,
    date: data.date,
    bosses: data.boss_contents.map((b) => ({
      name: b.content_name,
      difficulty: b.difficulty,
      cycle: b.cycle,
      registered: b.registration_flag === true || b.registration_flag === 'true',
      complete:
        b.complete_flag === true ||
        b.complete_flag === 'true' ||
        b.clear_flag === true ||
        b.clear_flag === 'true',
      order: b.list_order_no,
    })),
  };
}
const hexaMatrixSchema = z.object({
  character_hexa_core_equipment: z
    .array(
      z.object({
        hexa_core_name: z.string(),
        hexa_core_level: z.number().int().min(0).max(30),
        hexa_core_type: z.string().nullish(),
        linked_skill: z.array(z.object({ hexa_skill_id: z.string() })).nullish(),
      }),
    )
    .nullish(),
});
const skillListSchema = z.object({
  character_skill: z
    .array(z.object({ skill_name: z.string(), skill_icon: z.string().nullish() }))
    .nullish(),
});
/**
 * HEXA 계산기용: 장착한 코어의 이름·레벨·종류와, 6차 스킬 목록(skills)에서 이름으로 찾은 아이콘을 돌려준다.
 * 코어 이름이나 연결된 스킬 이름이 스킬 목록과 같으면 그 아이콘을 쓴다.
 */
export function hexaCores(input: unknown, skills?: unknown): HexaResponse {
  const data = hexaMatrixSchema.parse(input);
  const icons = new Map<string, string>();
  for (const skill of skillListSchema.safeParse(skills).data?.character_skill ?? [])
    if (skill.skill_icon && hexaIconPattern.test(skill.skill_icon))
      icons.set(skill.skill_name, skill.skill_icon);
  return hexaResponseSchema.parse({
    cores: (data.character_hexa_core_equipment ?? []).map((core) => {
      const names = [core.hexa_core_name, ...(core.linked_skill ?? []).map((s) => s.hexa_skill_id)];
      const icon = names.map((name) => icons.get(name)).find(Boolean);
      return {
        name: core.hexa_core_name.slice(0, 80),
        level: core.hexa_core_level,
        type: (core.hexa_core_type ?? '').slice(0, 40),
        ...(icon ? { icon } : {}),
      };
    }),
  });
}
type Reader = (path: string) => Promise<unknown>;
/** 코어 레벨과 6차 스킬 아이콘을 읽는다. 아이콘은 있으면 좋은 정보라 실패해도 코어 계산은 보여 준다. */
async function readHexa(read: Reader, ocid: string) {
  const query = '?ocid=' + encodeURIComponent(ocid);
  const matrix = await read('character/hexamatrix' + query);
  const skills = await read('character/skill' + query + '&character_skill_grade=6').catch(
    () => undefined,
  );
  return hexaCores(matrix, skills);
}

const basicSchema = z.object({
  character_name: z.string(),
  world_name: z.string(),
  character_class: z.string(),
  character_level: z.number().int(),
  character_image: z.string().nullish(),
});

/**
 * 닉네임만으로 HEXA 코어를 찾는다. 사이트 운영 키(Cloudflare Secret NEXON_API_KEY)로 조회하며
 * 키는 응답·로그에 남기지 않는다. 키가 없으면 개인 키로 불러오도록 안내한다.
 */
export async function hexaSearch(nickname: string, siteKey: string | undefined) {
  if (!siteKey || !/^[A-Za-z0-9_-]{32,256}$/.test(siteKey))
    return json(
      { error: '닉네임 검색을 아직 준비 중이에요. 아래 내 API 키로 불러오기를 이용해 주세요.' },
      503,
    );
  const read = nexonReader(siteKey);
  try {
    const id = z
      .object({ ocid: ocidSchema })
      .safeParse(await read('id?character_name=' + encodeURIComponent(nickname)));
    if (!id.success) return json({ error: '캐릭터를 찾지 못했어요. 닉네임을 확인해 주세요.' }, 404);
    const ocid = id.data.ocid;
    const basic = basicSchema.parse(await read('character/basic?ocid=' + encodeURIComponent(ocid)));
    const image = characterImageSchema.safeParse(basic.character_image ?? '').data;
    return json(
      hexaSearchResponseSchema.parse({
        character: {
          ocid,
          name: basic.character_name,
          world: basic.world_name,
          job: basic.character_class.trim(),
          level: basic.character_level,
          ...(image ? { image } : {}),
        },
        ...(await readHexa(read, ocid)),
      }),
    );
  } catch (e) {
    return json(
      {
        error:
          e instanceof NexonError
            ? e.message
            : '넥슨 API 응답이 지연되거나 형식이 달라요. 잠시 후 다시 시도해 주세요.',
      },
      e instanceof NexonError ? e.status : 502,
    );
  }
}
export function combatPower(data: unknown): number | null {
  const parsed = z
    .object({ final_stat: z.array(z.object({ stat_name: z.string(), stat_value: z.string() })) })
    .safeParse(data);
  if (!parsed.success) return null;
  const value = parsed.data.final_stat.find((s) => s.stat_name === '전투력')?.stat_value;
  if (typeof value !== 'string' || !/^\d+$/.test(value)) return null;
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : null;
}
export async function nexonAction(input: unknown) {
  const parsed = z.record(z.string(), z.unknown()).safeParse(input);
  if (!parsed.success) return json({ error: '요청을 확인해 주세요.' }, 400);
  const body = parsed.data;
  const key = typeof body.apiKey === 'string' ? body.apiKey.trim() : '';
  if (!/^[A-Za-z0-9_-]{32,256}$/.test(key))
    return json({ error: '넥슨 Open API 키를 확인해 주세요.' }, 400);
  const read = nexonReader(key);
  try {
    if (body.action === 'nexon-powers' || body.action === 'nexon-schedulers') {
      if (
        !Array.isArray(body.ocids) ||
        body.ocids.length < 1 ||
        body.ocids.length > 8 ||
        !body.ocids.every(validOcid) ||
        new Set(body.ocids).size !== body.ocids.length
      )
        return json({ error: '캐릭터는 한 요청에 1~8명까지 조회할 수 있어요.' }, 400);
      const results = await Promise.all(
        body.ocids.map(async (ocid: string) => {
          try {
            if (body.action === 'nexon-powers') {
              const power = combatPower(
                await read('character/stat?ocid=' + encodeURIComponent(ocid)),
              );
              return power === null
                ? { ocid, error: '전투력 정보가 없어요.' }
                : { ocid, combatPower: power };
            }
            const query = '?ocid=' + encodeURIComponent(ocid);
            // 자동 동기화는 클리어 상태만 필요하므로 이미지 조회를 생략해 호출 수를 절반으로 줄인다.
            const schedule = scheduler(await read('scheduler/character-state' + query));
            // Only fetch a portrait after the scheduler is valid; failed rows cannot use it.
            const image =
              body.images === false
                ? undefined
                : await read('character/basic' + query)
                    .then(
                      (data) =>
                        z.object({ character_image: characterImageSchema }).safeParse(data).data
                          ?.character_image,
                    )
                    .catch(() => undefined);
            return { ocid, ...schedule, image };
          } catch (e) {
            return {
              ocid,
              error:
                e instanceof NexonError ? e.message : '캐릭터 조회가 지연되었거나 정보가 없어요.',
              status: e instanceof NexonError ? e.status : 502,
            };
          }
        }),
      );
      return json({ results });
    }
    if (body.action === 'nexon-characters') {
      const data = characterListSchema.parse(await read('character/list'));
      if (!Array.isArray(data.account_list)) throw Error();
      const characters = data.account_list
        .flatMap((a) => (Array.isArray(a.character_list) ? a.character_list : []))
        .map((c) => ({
          ocid: c.ocid,
          name: c.character_name,
          world: c.world_name,
          job: c.character_class,
          level: c.character_level,
        }));
      return json({ characters });
    }
    if (body.action === 'nexon-hexa') {
      if (!validOcid(body.ocid)) return json({ error: '캐릭터를 다시 선택해 주세요.' }, 400);
      return json(await readHexa(read, body.ocid));
    }
    if (body.action !== 'nexon-scheduler' || !validOcid(body.ocid))
      return json({ error: '캐릭터를 다시 선택해 주세요.' }, 400);
    return json(
      scheduler(await read('scheduler/character-state?ocid=' + encodeURIComponent(body.ocid))),
    );
  } catch (e) {
    return json(
      {
        error:
          e instanceof NexonError
            ? e.message
            : '넥슨 API 응답이 지연되거나 형식이 달라요. 잠시 후 다시 시도해 주세요.',
      },
      e instanceof NexonError ? e.status : 502,
    );
  }
}
