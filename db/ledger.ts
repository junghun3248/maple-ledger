import { env } from 'cloudflare:workers';

export function ledgerDatabase(): D1Database {
  if (!env.DB) throw new Error('Ledger database binding is unavailable');
  return env.DB;
}
