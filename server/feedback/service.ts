import {
  feedbackRequestSchema,
  type FeedbackPost,
  type FeedbackRequest,
} from '@/contracts/feedback/schema';

export const FEEDBACK_PAGE = 100;

type Row = {
  id: string;
  body: string;
  created_at: number;
  reply: string;
  replied_at: number;
};
const toPost = (row: Row): FeedbackPost => ({
  id: row.id,
  body: row.body,
  createdAt: row.created_at,
  reply: row.reply || null,
  repliedAt: row.replied_at || null,
});

/** 최근 글부터 보여 준다. 작성자 정보는 저장하지도 돌려주지도 않는다. */
export async function listFeedback(db: D1Database) {
  const { results } = await db
    .prepare(
      'SELECT id,body,created_at,reply,replied_at FROM feedback_posts ORDER BY created_at DESC LIMIT ?',
    )
    .bind(FEEDBACK_PAGE)
    .all<Row>();
  return results.map(toPost);
}

export async function createFeedback(db: D1Database, body: string, now = Date.now()) {
  const post: FeedbackPost = {
    id: crypto.randomUUID(),
    body,
    createdAt: now,
    reply: null,
    repliedAt: null,
  };
  await db
    .prepare('INSERT INTO feedback_posts (id,body,created_at) VALUES (?,?,?)')
    .bind(post.id, post.body, post.createdAt)
    .run();
  return post;
}

/** 운영자 답글. 빈 문자열이면 답글을 지운다. */
export async function replyFeedback(db: D1Database, id: string, reply: string, now = Date.now()) {
  const result = await db
    .prepare('UPDATE feedback_posts SET reply=?, replied_at=? WHERE id=?')
    .bind(reply, reply ? now : 0, id)
    .run();
  return result.meta.changes > 0;
}

export async function deleteFeedback(db: D1Database, id: string) {
  const result = await db.prepare('DELETE FROM feedback_posts WHERE id=?').bind(id).run();
  return result.meta.changes > 0;
}

/** 길이가 달라도 시간이 새지 않도록 해시끼리 비교한다. */
export async function samePassword(given: string, expected: string | undefined) {
  if (!expected) return false;
  const hash = async (v: string) =>
    new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(v)));
  const [a, b] = await Promise.all([hash(given), hash(expected)]);
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export function parseFeedbackRequest(
  value: unknown,
): { ok: true; data: FeedbackRequest } | { ok: false; error: string } {
  const parsed = feedbackRequestSchema.safeParse(value);
  return parsed.success
    ? { ok: true, data: parsed.data }
    : { ok: false, error: parsed.error.issues[0]?.message || '요청을 확인해 주세요.' };
}
