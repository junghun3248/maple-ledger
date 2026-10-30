import { requestEnvelopeSchema, saveLedgerSchema } from '@/contracts/ledger/schema';
import type { RequestEnvelope } from '@/contracts/ledger/request';
import type { LedgerBookRow } from '@/db/ledger-types';
import { bookCredentialError } from '@/server/ledger/book-credentials';
import { searchCharacter } from '@/server/ledger/character-search';
import { nexonAction } from '@/server/ledger/nexon';
import { bossAction } from '@/server/ledger/boss-store';
import { ledgerDatabase as db } from '@/db/ledger';
import { random, digest, passwordHash, equal, cookie, session } from './auth';
import { limit } from './rate-limit';
import { json } from './response';
export const dynamic = 'force-dynamic';
export async function GET(req: Request) {
  const book = await session(req);
  if (!book) return json({ error: '기록장을 먼저 열어 주세요.' }, 401);
  return json({ name: book.name, records: JSON.parse(book.records), revision: book.revision });
}
export async function POST(req: Request) {
  if (req.headers.get('origin') !== new URL(req.url).origin)
    return json({ error: '허용되지 않은 요청입니다.' }, 403);
  if (!req.headers.get('content-type')?.startsWith('application/json'))
    return json({ error: 'JSON 요청이 필요합니다.' }, 415);
  const reader = req.body?.getReader();
  if (!reader) return json({ error: '빈 요청입니다.' }, 400);
  let size = 0;
  const parts: Uint8Array[] = [];
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 2500000) {
      await reader.cancel();
      return json({ error: '기록 용량이 너무 큽니다.' }, 413);
    }
    parts.push(value);
  }
  let body: RequestEnvelope;
  try {
    const data = new Uint8Array(size);
    let offset = 0;
    for (const part of parts) {
      data.set(part, offset);
      offset += part.length;
    }
    body = requestEnvelopeSchema.parse(JSON.parse(new TextDecoder().decode(data)));
    if (!body || typeof body !== 'object') throw Error();
  } catch {
    return json({ error: '요청을 읽을 수 없습니다.' }, 400);
  }
  const ip = req.headers.get('cf-connecting-ip') || 'local';
  if (
    ['nexon-characters', 'nexon-scheduler', 'nexon-powers', 'nexon-schedulers'].includes(
      body.action || '',
    )
  ) {
    if (!(await limit('nexon:' + ip, 30, 60000)))
      return json({ error: '조회가 많아요. 1분 뒤 다시 시도해 주세요.' }, 429);
    return nexonAction(body);
  }
  if (body.action === 'character-search') {
    const nickname = typeof body.nickname === 'string' ? body.nickname.trim() : '';
    if (!/^[가-힣a-zA-Z0-9]{2,12}$/.test(nickname))
      return json({ error: '닉네임은 한글·영문·숫자 2~12자로 입력해 주세요.' }, 400);
    if (!(await limit('character:' + ip, 15, 60000)))
      return json({ error: '검색이 많아요. 1분 뒤 다시 시도해 주세요.' }, 429);
    try {
      const character = await searchCharacter(nickname);
      return character
        ? json({ character })
        : json(
            { error: '공식 랭킹에서 찾지 못했어요. 닉네임을 확인하거나 직접 추가해 주세요.' },
            404,
          );
    } catch {
      return json(
        { error: '공식 랭킹 조회가 지연되고 있어요. 잠시 후 다시 검색하거나 직접 추가해 주세요.' },
        502,
      );
    }
  }
  if (body.action === 'create' || body.action === 'open') {
    if (!(await limit('login:' + ip, 30, 600000)))
      return json({ error: '시도가 많아요. 10분 뒤 다시 시도해 주세요.' }, 429);
    const name =
      typeof body.name === 'string' ? body.name.trim().normalize('NFKC').toLowerCase() : '';
    const credentialError = bookCredentialError(name, body.password, body.action === 'create');
    if (credentialError) return json({ error: credentialError }, 400);
    if (typeof body.password !== 'string') return json({ error: '비밀번호를 입력해 주세요.' }, 400);
    let book = await db()
      .prepare('SELECT * FROM ledger_books WHERE name=?')
      .bind(name)
      .first<LedgerBookRow>();
    if (body.action === 'create') {
      if (book)
        return json(
          {
            error: '사용 중인 기록장 이름이에요. 다른 이름을 선택하거나 기존 기록장을 열어 주세요.',
          },
          409,
        );
      if (!(await limit('create:' + ip, 5, 86400000)))
        return json({ error: '오늘 만들 수 있는 기록장 수를 초과했어요.' }, 429);
      const salt = random(),
        id = crypto.randomUUID(),
        hash = await passwordHash(body.password, salt);
      const result = await db()
        .prepare(
          'INSERT OR IGNORE INTO ledger_books (id,name,salt,password,records,revision) VALUES (?,?,?,?,?,0)',
        )
        .bind(id, name, salt, hash, '[]')
        .run();
      if (!result.meta.changes) return json({ error: '사용 중인 기록장 이름이에요.' }, 409);
      book = { id, name, salt, password: hash, records: '[]', revision: 0 };
    } else {
      const computed = await passwordHash(body.password, book?.salt || '0'.repeat(64));
      if (!book || !equal(computed, book.password))
        return json({ error: '기록장 이름 또는 비밀번호가 맞지 않아요.' }, 401);
    }
    const token = random();
    await db()
      .prepare('INSERT INTO ledger_sessions (token,book,expires) VALUES (?,?,?)')
      .bind(await digest(token), book.id, Date.now() + 604800000)
      .run();
    await db().batch([
      db().prepare('DELETE FROM ledger_sessions WHERE expires<?').bind(Date.now()),
      db().prepare('DELETE FROM ledger_limits WHERE expires<?').bind(Date.now()),
    ]);
    return json({ ok: true }, 200, { 'Set-Cookie': cookie(req, token) });
  }
  if (body.action === 'close') {
    const token = req.headers
      .get('cookie')
      ?.match(/(?:^|;\s*)maple_session=([a-f0-9]{64})(?:;|$)/)?.[1];
    if (token)
      await db()
        .prepare('DELETE FROM ledger_sessions WHERE token=?')
        .bind(await digest(token))
        .run();
    return json({ ok: true }, 200, { 'Set-Cookie': cookie(req, '', 0) });
  }
  const book = await session(req);
  if (!book) return json({ error: '기록장을 다시 열어 주세요.' }, 401);
  if (body.action === 'boss-read' || body.action === 'boss-save')
    return bossAction(db(), book, body);
  if (body.action === 'save') {
    const parsed = saveLedgerSchema.safeParse(body);
    if (!parsed.success)
      return json({ error: '기록 형식을 확인해 주세요. 최대 10,000개까지 저장할 수 있어요.' }, 400);
    const clean = parsed.data.records;
    const result = await db()
      .prepare('UPDATE ledger_books SET records=?,revision=revision+1 WHERE id=? AND revision=?')
      .bind(JSON.stringify(clean), book.id, parsed.data.revision)
      .run();
    if (!result.meta.changes)
      return json(
        { error: '다른 기기에서 기록이 바뀌었어요. 새로 동기화한 뒤 다시 저장해 주세요.' },
        409,
      );
    return json({ revision: parsed.data.revision + 1 });
  }
  return json({ error: '지원하지 않는 요청입니다.' }, 400);
}
