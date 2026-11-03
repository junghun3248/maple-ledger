import { probabilityRequest, tablesSchema, type Tables } from '@/contracts/simulator/schema';
const cache = new Map<string, { expires: number; tables: Tables }>();
const source = 'https://maplestory.nexon.com/Guide/OtherProbability/cube/';
function text(html: string) {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .trim();
}
export function parseTables(html: string): Tables {
  const tables = [
    ...html.matchAll(/<table[^>]*class="cube_data[^" ]*(?: [^"]*)?"[^>]*>([\s\S]*?)<\/table>/g),
  ].map((m) =>
    [...m[1].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].flatMap((row) => {
      const cells = [...row[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((c) => text(c[1]));
      if (cells.length !== 2) return [];
      return [{ text: cells[0], weight: Number(cells[1].replace('%', '')) }];
    }),
  );
  const valid = tablesSchema.parse(tables);
  if (valid.some((t) => Math.abs(t.reduce((n, o) => n + o.weight, 0) - 100) > 0.05))
    throw Error('공식 확률표 합계를 확인하지 못했어요.');
  return valid;
}
export async function probabilities(input: unknown) {
  const q = probabilityRequest.parse(input),
    key = JSON.stringify(q),
    old = cache.get(key);
  if (old && old.expires > Date.now()) return old.tables;
  const response = await fetch(source + 'GetSearchProbList', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'X-Requested-With': 'XMLHttpRequest',
      Referer: source + (q.mode === 'potential' ? 'black' : 'addi'),
    },
    body: new URLSearchParams({
      nCubeItemID: q.mode === 'potential' ? '5062010' : '5062500',
      nGrade: String(q.grade),
      nPartsType: String(q.part),
      nReqLev: String(q.level),
    }),
    signal: AbortSignal.timeout(15000),
    redirect: 'manual',
  });
  if (!response.ok) throw Error('공식 확률표 조회가 지연되고 있어요.');
  const tables = parseTables(await response.text());
  if (cache.size >= 100) cache.delete(cache.keys().next().value!);
  cache.set(key, { tables, expires: Date.now() + 3600000 });
  return tables;
}
