import { z } from 'zod';
const origin = 'https://open.api.nexon.com/maplestory/v1/';
const ocidSchema = z.string().regex(/^\w{16,128}$/);
const validOcid = (id: unknown): id is string => ocidSchema.safeParse(id).success;
class NexonError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}
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
  async function read(path: string) {
    const response = await fetch(origin + path, {
      headers: { 'x-nxopen-api-key': key },
      signal: AbortSignal.timeout(15000),
      redirect: 'manual',
    });
    if (!response.ok) {
      const error = new NexonError(
        response.status === 429
          ? '넥슨 조회가 많아요. 잠시 후 다시 시도해 주세요.'
          : response.status === 403
            ? 'API 키의 권한과 본인 계정 캐릭터인지 확인해 주세요.'
            : '넥슨에서 조회하지 못했어요. 키와 캐릭터 접속 여부를 확인해 주세요.',
        response.status === 429 ? 429 : 400,
      );
      error.status = response.status === 429 ? 429 : 400;
      throw error;
    }
    return response.json();
  }
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
            return {
              ocid,
              ...scheduler(
                await read('scheduler/character-state?ocid=' + encodeURIComponent(ocid)),
              ),
            };
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
