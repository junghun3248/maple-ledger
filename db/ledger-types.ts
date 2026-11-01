export interface LedgerSessionBook {
  id: string;
  name: string;
  records: string;
  revision: number;
}
export interface LedgerBookRow extends LedgerSessionBook {
  salt: string;
  password: string;
}
export interface BossPlanRow {
  data: string;
  revision: number;
}
