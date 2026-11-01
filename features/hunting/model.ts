import type { LedgerRecord } from '@/contracts/ledger/request';
export { dateKey, money } from '@/lib/ledger/format';
import { money } from '@/lib/ledger/format';
export const delta = (r: LedgerRecord, k: 'm' | 'f') =>
  BigInt(r[k === 'm' ? 'am' : 'af']) - BigInt(r[k === 'm' ? 'bm' : 'bf']);
export const total = (rows: LedgerRecord[], k: 'm' | 'f') =>
  rows.reduce((n, r) => n + delta(r, k), 0n);
export const signed = (n: bigint) => (n > 0n ? '+' : '') + money(n);
export function compact(n: bigint) {
  const a = n < 0n ? -n : n;
  return (
    (n < 0n ? '-' : n > 0n ? '+' : '') +
    (a >= 100000000n
      ? `${Number(a / 1000000n) / 100}억`
      : a >= 10000n
        ? `${a / 10000n}만`
        : String(a))
  );
}
