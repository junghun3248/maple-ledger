# DB

- `schema.ts`: Drizzle 테이블 선언
- `ledger.ts`: 요청 환경의 D1 연결
- `ledger-types.ts`: 조회 결과 타입
- [저장 규칙·테이블·마이그레이션](../docs/database.md)

서비스의 DB 접근은 `server/ledger/`, 공유 API 계약은 `contracts/`에서 관리한다. 새 DB 변경은 `drizzle/` 마이그레이션과 함께 검토한다.
