import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { feedbackRequestSchema, hasLink } from '@/contracts/feedback/schema';
import {
  createFeedback,
  deleteFeedback,
  listFeedback,
  replyFeedback,
  samePassword,
} from '@/server/feedback/service';

// 새 마이그레이션 파일로 만든 메모리 SQLite에 D1처럼 쓰는 얇은 어댑터
function database() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(readFileSync(new URL('../drizzle/0004_feedback-posts.sql', import.meta.url), 'utf8'));
  const statement = (sql: string, values: SQLInputValue[] = []) => ({
    bind: (...next: SQLInputValue[]) => statement(sql, next),
    all: async () => ({ results: sqlite.prepare(sql).all(...values) }),
    run: async () => ({ meta: { changes: Number(sqlite.prepare(sql).run(...values).changes) } }),
  });
  return { prepare: (sql: string) => statement(sql) } as unknown as D1Database;
}

test('posts are listed newest first with replies, and can be deleted', async () => {
  const db = database();
  const first = await createFeedback(db, '첫 번째 건의', 1000);
  const second = await createFeedback(db, '두 번째 건의', 2000);
  assert.deepEqual(
    (await listFeedback(db)).map((p) => p.body),
    ['두 번째 건의', '첫 번째 건의'],
  );
  assert.equal(await replyFeedback(db, first.id, '수정했어요', 3000), true);
  const replied = (await listFeedback(db)).find((p) => p.id === first.id);
  assert.equal(replied?.reply, '수정했어요');
  assert.equal(replied?.repliedAt, 3000);
  await replyFeedback(db, first.id, '');
  assert.equal((await listFeedback(db)).find((p) => p.id === first.id)?.reply, null);
  assert.equal(await deleteFeedback(db, second.id), true);
  assert.equal(await deleteFeedback(db, second.id), false);
  assert.equal((await listFeedback(db)).length, 1);
});

test('requests reject links, empty and overlong text', () => {
  const create = (body: string) => feedbackRequestSchema.safeParse({ action: 'create', body });
  assert.equal(create('헥사 계산기 좋아요').success, true);
  assert.equal(create(' ').success, false);
  assert.equal(create('가'.repeat(301)).success, false);
  for (const link of ['https://example.com', 'www.example.com', '광고 site.xyz 방문']) {
    assert.equal(hasLink(link), true, link);
    assert.equal(create(link).success, false);
  }
  assert.equal(hasLink('3.5억 메소'), false);
  assert.equal(
    feedbackRequestSchema.safeParse({ action: 'delete', id: 'not-a-uuid', password: 'x' }).success,
    false,
  );
});

test('admin password must match and is required', async () => {
  assert.equal(await samePassword('secret-pass', 'secret-pass'), true);
  assert.equal(await samePassword('secret-pas', 'secret-pass'), false);
  assert.equal(await samePassword('anything', undefined), false);
});
