import type { BossRequest } from '@/contracts/boss/request';
import type { BossPlanRow } from '@/db/ledger-types';
import { bossStateSchema } from '@/contracts/boss/schema';
export async function bossAction(
  db: D1Database,
  book: { id: string; name: string },
  body: BossRequest,
) {
  const json = (v: unknown, status = 200) =>
    Response.json(v, { status, headers: { 'Cache-Control': 'no-store' } });
  if (body.action === 'boss-read') {
    const row = await db
      .prepare('SELECT data,revision FROM boss_plans WHERE book=?')
      .bind(book.id)
      .first<BossPlanRow>();
    return json({
      name: book.name,
      state: row ? JSON.parse(row.data) : { characters: [] },
      revision: row?.revision || 0,
    });
  }
  if (
    typeof body.revision !== 'number' ||
    !Number.isSafeInteger(body.revision) ||
    body.revision < 0 ||
    !bossStateSchema.safeParse(body.state).success
  )
    return json(
      {
        error:
          '보스 기록 형식을 확인해 주세요. 캐릭터 36명, 전체 보스 기록 1,000개까지 저장할 수 있어요.',
      },
      400,
    );
  await db
    .prepare('INSERT OR IGNORE INTO boss_plans (book,data,revision) VALUES (?,?,0)')
    .bind(book.id, '{"characters":[]}')
    .run();
  const result = await db
    .prepare('UPDATE boss_plans SET data=?,revision=revision+1 WHERE book=? AND revision=?')
    .bind(JSON.stringify(body.state), book.id, body.revision)
    .run();
  if (!result.meta.changes)
    return json(
      {
        error:
          '다른 기기에서 보스 기록이 바뀌었어요. 현재 내용을 백업한 뒤 서버 기록을 다시 불러와 주세요.',
      },
      409,
    );
  return json({ revision: body.revision + 1 });
}
