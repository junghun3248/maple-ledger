/** 세션 확인에 필요한 최소 정보. 기록 본문은 필요한 요청에서만 따로 읽는다. */
export interface LedgerSessionBook {
  id: string;
  name: string;
}
export interface LedgerBookRow extends LedgerSessionBook {
  records: string;
  revision: number;
  salt: string;
  password: string;
}
export interface BossPlanRow {
  data: string;
  revision: number;
}
