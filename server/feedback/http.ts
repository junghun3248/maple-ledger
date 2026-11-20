import { env } from 'cloudflare:workers';
import { ledgerDatabase } from '@/db/ledger';
import { limit } from '@/server/ledger/rate-limit';
import {
  createFeedback,
  deleteFeedback,
  listFeedback,
  parseFeedbackRequest,
  replyFeedback,
  samePassword,
} from './service';

const headers = { 'Cache-Control': 'no-store' };
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers });
const MAX_BYTES = 4000;

export async function GET() {
  return reply({ posts: await listFeedback(ledgerDatabase()) });
}

async function readBody(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > MAX_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  if (request.headers.get('origin') !== new URL(request.url).origin)
    return reply({ error: '잘못된 요청이에요.' }, 403);
  if (!request.headers.get('content-type')?.startsWith('application/json'))
    return reply({ error: '잘못된 요청이에요.' }, 415);
  const parsed = parseFeedbackRequest(await readBody(request));
  if (!parsed.ok) return reply({ error: parsed.error }, 400);
  const ip = request.headers.get('cf-connecting-ip') || 'local';
  const db = ledgerDatabase();
  const body = parsed.data;

  if (body.action === 'create') {
    // 도배 방지: IP당 1분 1개·하루 10개, 사이트 전체 하루 300개.
    if (
      !(await limit('feedback:' + ip, 1, 60000)) ||
      !(await limit('feedback-day:' + ip, 10, 86400000)) ||
      !(await limit('feedback-all', 300, 86400000))
    )
      return reply({ error: '글을 너무 자주 남겼어요. 잠시 후 다시 남겨 주세요.' }, 429);
    return reply({ post: await createFeedback(db, body.body) });
  }

  // 운영자 기능: 비밀번호를 틀리게 반복해서 맞혀 보지 못하게 시도 수를 제한한다.
  if (!(await limit('feedback-admin:' + ip, 10, 600000)))
    return reply({ error: '시도가 많아요. 10분 뒤 다시 해 주세요.' }, 429);
  if (!env.FEEDBACK_ADMIN_PASSWORD)
    return reply({ error: '운영자 비밀번호가 설정되지 않았어요.' }, 503);
  if (!(await samePassword(body.password, env.FEEDBACK_ADMIN_PASSWORD)))
    return reply({ error: '운영자 비밀번호가 맞지 않아요.' }, 401);
  if (body.action === 'admin-check') return reply({ ok: true });
  const done =
    body.action === 'reply'
      ? await replyFeedback(db, body.id, body.reply)
      : await deleteFeedback(db, body.id);
  return done ? reply({ ok: true }) : reply({ error: '글을 찾지 못했어요.' }, 404);
}
