import type { LedgerSessionBook } from '@/db/ledger-types';
import { ledgerDatabase as db } from '@/db/ledger';
const encoder = new TextEncoder();
const hex = (a: ArrayBuffer | Uint8Array) =>
  Array.from(new Uint8Array(a instanceof Uint8Array ? a.buffer : a), (x) =>
    x.toString(16).padStart(2, '0'),
  ).join('');
export const random = () => hex(crypto.getRandomValues(new Uint8Array(32)));
export const digest = async (s: string) =>
  hex(await crypto.subtle.digest('SHA-256', encoder.encode(s)));
export async function passwordHash(password: string, salt: string) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, [
    'deriveBits',
  ]);
  return hex(
    await crypto.subtle.deriveBits(
      { name: 'PBKDF2', hash: 'SHA-256', salt: encoder.encode(salt), iterations: 100000 },
      key,
      256,
    ),
  );
}
export function equal(a: string, b: string) {
  let diff = a.length ^ b.length;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function cookie(req: Request, token: string, age = 604800) {
  return `maple_session=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${age}${new URL(req.url).protocol === 'https:' ? '; Secure' : ''}`;
}
export async function session(req: Request) {
  const token = req.headers
    .get('cookie')
    ?.match(/(?:^|;\s*)maple_session=([a-f0-9]{64})(?:;|$)/)?.[1];
  if (!token) return null;
  return db()
    .prepare(
      'SELECT b.id,b.name,b.records,b.revision FROM ledger_sessions s JOIN ledger_books b ON b.id=s.book WHERE s.token=? AND s.expires>?',
    )
    .bind(await digest(token), Date.now())
    .first<LedgerSessionBook>();
}
