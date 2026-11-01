import type { LedgerRecord } from './request';
export interface LedgerResponse {
  name: string;
  records: LedgerRecord[];
  revision: number;
}
