const plain = (s: string) =>
  s
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, ' ')
    .trim();
export function parseRanking(html: string, nickname: string) {
  const worlds = new Map<string, string>();
  for (const m of html.matchAll(
    /<img[^>]+src="[^"]*world_icon\/icon_(\d+)\.png"[^>]+alt="([^"]+)"/g,
  ))
    worlds.set(m[1], plain(m[2]));
  for (const row of html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/g)) {
    const content = row[1],
      dt = content.match(/<dt>([\s\S]*?)<\/dt>/)?.[1];
    if (!dt) continue;
    const name = plain(dt);
    if (name.toLocaleLowerCase() !== nickname.toLocaleLowerCase()) continue;
    const image =
      content.match(/src="(https:\/\/avatar\.maplestory\.nexon\.com\/[^"<>]+)"/)?.[1] || '';
    const worldId = dt.match(/world_icon\/icon_(\d+)\.png/)?.[1] || '';
    const level = Number(content.match(/Lv\.(\d+)/)?.[1]);
    const job = plain(content.match(/<dd>([\s\S]*?)<\/dd>/)?.[1] || '');
    if (!level || !job) continue;
    return {
      name,
      profile: {
        image,
        world: worlds.get(worldId) || '월드 정보 없음',
        job,
        level,
        checkedAt: new Date().toISOString(),
      },
    };
  }
  return null;
}
export async function searchCharacter(nickname: string) {
  const url = new URL('https://maplestory.nexon.com/N23Ranking/World/Total');
  url.searchParams.set('c', nickname);
  url.searchParams.set('w', '0');
  const response = await fetch(url, {
    signal: AbortSignal.timeout(12000),
    headers: { Accept: 'text/html' },
  });
  if (!response.ok) throw Error('공식 랭킹 조회가 지연되고 있어요. 잠시 후 다시 검색해 주세요.');
  const html = await response.text();
  if (html.length > 2000000) throw Error('랭킹 응답을 처리하지 못했어요.');
  if (!html.includes('ranking_search_bar'))
    throw Error('공식 랭킹에 연결하지 못했어요. 잠시 후 다시 검색해 주세요.');
  return parseRanking(html, nickname);
}
