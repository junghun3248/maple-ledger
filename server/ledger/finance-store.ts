import { financeSaveSchema } from '@/contracts/ledger/finance-schema';
import type { LedgerSessionBook } from '@/db/ledger-types';
import type { RequestEnvelope } from '@/contracts/ledger/request';
import { json } from './response';

export async function financeAction(
  db: D1Database,
  book: LedgerSessionBook,
  body: RequestEnvelope,
) {
  if (body.action === 'finance-read') {
    const row = await db
      .prepare(
        'SELECT b.records,b.finance,b.finance_revision AS revision,p.data AS bosses FROM ledger_books b LEFT JOIN boss_plans p ON p.book=b.id WHERE b.id=?',
      )
      .bind(book.id)
      .first<{ records: string; finance: string; revision: number; bosses: string | null }>();
    if (!row) return json({ error: '기록장을 다시 열어 주세요.' }, 401);
    return json({
      bookId: book.id,
      name: book.name,
      records: JSON.parse(row.records),
      bosses: row.bosses ? JSON.parse(row.bosses) : { characters: [] },
      finance: JSON.parse(row.finance),
      revision: row.revision,
    });
  }
  const parsed = financeSaveSchema.safeParse(body);
  if (!parsed.success)
    return json({ error: '금액·날짜·목표 또는 중복 항목을 확인해 주세요.' }, 400);
  if (parsed.data.bookId !== book.id)
    return json({ error: '열린 기록장이 바뀌었습니다. 새로고침 후 다시 저장해 주세요.' }, 409);
  const changed = await db
    .prepare(
      'UPDATE ledger_books SET finance=?,finance_revision=finance_revision+1 WHERE id=? AND finance_revision=?',
    )
    .bind(JSON.stringify(parsed.data.finance), book.id, parsed.data.revision)
    .run();
  if (!changed.meta.changes)
    return json(
      { error: '다른 기기에서 자산 장부가 바뀌었습니다. 입력 내용을 복사한 뒤 새로고침해 주세요.' },
      409,
    );
  return json({ revision: parsed.data.revision + 1 });
}

