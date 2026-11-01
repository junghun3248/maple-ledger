import type { RequestEnvelope } from '@/contracts/ledger/request';
import type { LedgerBookRow } from '@/db/ledger-types';
import { ledgerDatabase as db } from '@/db/ledger';
import { bookCredentialError } from './book-credentials';
import { random, digest, passwordHash, equal, cookie } from './auth';
import { limit } from './rate-limit';
import { json } from './response';
export async function accountAction(req: Request, body: RequestEnvelope, ip: string) {
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
  return json({ error: '지원하지 않는 계정 요청입니다.' }, 400);
}
