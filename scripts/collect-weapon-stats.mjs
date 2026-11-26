import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { parseArgs } from 'node:util';
import { z } from 'zod';
import { weaponStatsSnapshot } from '@/contracts/weapon-stats/schema';
import { aggregateWeaponStats, classifyWeapon } from '@/server/weapon-stats/model';

const { values } = parseArgs({
  options: {
    date: { type: 'string' },
    'min-level': { type: 'string', default: '0' },
    pages: { type: 'string' },
    'interval-ms': { type: 'string', default: '250' },
  },
});
const date = values.date;
const minLevel = Number(values['min-level']);
const pageLimit = values.pages === undefined ? null : Number(values.pages);
const interval = Number(values['interval-ms']);
const key = process.env.NEXON_API_KEY;
const snapshotPath = 'public/weapon-stats.json';
const temporarySuffix = `.${process.pid}.tmp`;

const rankingSchema = z.object({
  ranking: z.array(
    z.object({
      character_name: z.string().min(1),
      world_name: z.string().min(1),
      class_name: z.string().min(1),
      sub_class_name: z.string().nullish(),
      character_level: z.number().int().nonnegative(),
    }),
  ),
});
const idSchema = z.object({ ocid: z.string().min(1) });
const basicSchema = z.object({
  character_name: z.string(),
  world_name: z.string(),
  character_class: z.string().min(1),
  liberation_quest_clear: z.union([
    z.number().int().min(0).max(3),
    z.enum(['0', '1', '2', '3']).transform(Number),
  ]),
});

class NexonBatchError extends Error {
  constructor(endpoint, status, code) {
    super(`넥슨 API ${endpoint} 실패 (${status}${code ? ` · ${code}` : ''})`);
    this.status = status;
    this.code = code;
  }
}

let nextRequest = 0;
async function read(endpoint, parameters) {
  const url = new URL('https://open.api.nexon.com/maplestory/v1/' + endpoint);
  url.search = new URLSearchParams(parameters).toString();
  for (let attempt = 0; ; attempt++) {
    const now = Date.now();
    const start = Math.max(nextRequest, now);
    nextRequest = start + interval;
    if (start > now) await sleep(start - now);

    const response = await fetch(url, {
      headers: { 'x-nxopen-api-key': key },
      signal: AbortSignal.timeout(20_000),
      redirect: 'error',
    });
    if (response.ok) return response.json();
    const body = await response.json().catch(() => null);
    const rawCode = body?.error?.name;
    const code = typeof rawCode === 'string' && /^OPENAPI\d{5}$/.test(rawCode) ? rawCode : '';

    if (response.status >= 500 && attempt < 2) {
      await sleep(1_000 * (attempt + 1));
      continue;
    }
    throw new NexonBatchError(endpoint, response.status, code);
  }
}

function missingCharacter(error) {
  return (
    error instanceof NexonBatchError &&
    (error.status === 404 || ['OPENAPI00003', 'OPENAPI00009'].includes(error.code))
  );
}

async function inspect(character) {
  const { character_name, world_name, class_name, sub_class_name } = character;
  const id = createHash('sha256')
    .update(JSON.stringify([world_name, character_name]))
    .digest('hex');
  const unknown = { id, job: sub_class_name || class_name, stage: null, result: null };
  let ocid;
  let basic;
  try {
    ({ ocid } = idSchema.parse(await read('id', { character_name })));
    basic = basicSchema.parse(await read('character/basic', { ocid, date }));
  } catch (error) {
    if (missingCharacter(error)) return unknown;
    throw error;
  }
  if (basic.character_name !== character_name || basic.world_name !== world_name) return unknown;

  const stage = basic.liberation_quest_clear;
  const entry = { id, job: basic.character_class, stage, result: null };
  if (stage === 0) return entry;
  try {
    return {
      ...entry,
      result: classifyWeapon(await read('character/item-equipment', { ocid, date }), stage),
    };
  } catch (error) {
    if (missingCharacter(error)) return entry;
    throw error;
  }
}

async function collectPage(worldType, page) {
  let data;
  try {
    data = await read('ranking/overall', { date, world_type: worldType, page });
  } catch (error) {
    if (page > 1 && error instanceof NexonBatchError && error.code === 'OPENAPI00004') {
      return { entries: [], last: true };
    }
    throw error;
  }
  const { ranking } = rankingSchema.parse(data);
  const entries = [];
  const qualified = ranking.filter((character) => character.character_level >= minLevel);
  for (let index = 0; index < qualified.length; index += 12) {
    const results = await Promise.allSettled(qualified.slice(index, index + 12).map(inspect));
    for (const result of results) {
      if (result.status === 'rejected') throw result.reason;
      entries.push(result.value);
    }
  }
  return { entries, last: ranking.length === 0 || qualified.length < ranking.length };
}

async function readPage(file, worldType, page) {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const batch = await collectPage(worldType, page);
  await writeFile(file + temporarySuffix, JSON.stringify(batch));
  await rename(file + temporarySuffix, file);
  return batch;
}

async function main() {
  if (
    !date ||
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    !Number.isInteger(minLevel) ||
    minLevel < 0 ||
    (pageLimit !== null && (!Number.isInteger(pageLimit) || pageLimit < 1)) ||
    !Number.isInteger(interval) ||
    interval < 10
  ) {
    throw new Error('--date YYYY-MM-DD [--min-level 260] [--pages 10] [--interval-ms 250]');
  }
  if (!key) throw new Error('실행 환경에 NEXON_API_KEY가 필요해요.');

  // 페이지별 진행 기록은 Git에서 제외된 work/에 두고 같은 날짜와 레벨로 이어서 처리한다.
  const directory = join('work', 'weapon-stats', `${date}-lv${minLevel}`);
  await mkdir(directory, { recursive: true });
  const characters = new Map();
  for (const worldType of [0, 1]) {
    for (let page = 1; pageLimit === null || page <= pageLimit; page++) {
      const file = join(directory, `${worldType}-${page}.json`);
      const { entries, last } = await readPage(file, worldType, page);
      for (const entry of entries) {
        const previous = characters.get(entry.id);
        if (!previous || (previous.stage === null && entry.stage !== null)) {
          characters.set(entry.id, entry);
        }
      }
      if (page === 1 || page % 10 === 0 || last) {
        console.log(
          `월드 유형 ${worldType} · ${page}페이지 · ${characters.size.toLocaleString('ko-KR')}캐릭터`,
        );
      }
      if (last) break;
    }
  }

  const counts = aggregateWeaponStats(characters.values());
  if (!counts.totals.checked)
    throw new Error('확인된 해방 상태가 없어 집계 파일을 갱신하지 않았어요.');
  const snapshot = weaponStatsSnapshot.parse({ date, minLevel, pageLimit, ...counts });
  await writeFile(snapshotPath + temporarySuffix, JSON.stringify(snapshot, null, 2) + '\n');
  await rename(snapshotPath + temporarySuffix, snapshotPath);
  console.log(`해방 무기 통계 집계 완료 · ${date}`);
}

main().catch((error) => {
  console.error(error instanceof NexonBatchError ? error.message : error.message || '집계 실패');
  process.exitCode = 1;
});
