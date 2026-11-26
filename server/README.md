# 서버 서비스

`ledger/http.ts`가 요청 크기·형식·출처를 검사하고 서비스를 선택한다.

- `account.ts`, `auth.ts`, `book-credentials.ts`: 기록장 개설·로그인·세션·암호 검증
- `boss-store.ts`: 보스 저장 및 revision 충돌 검사
- `rate-limit.ts`: 조회·로그인 요청 제한
- `nexon.ts`: 공식 API 프록시와 일부 실패를 보존하는 일괄 조회
- `character-search.ts`: 닉네임 공식 랭킹 조회
- `../feedback/`: 건의 게시판 요청 처리(`http.ts`)와 저장(`service.ts`). 작성 제한·링크 차단·운영자 비밀번호 확인
- `../weapon-stats/model.ts`: 해방 주무기 에디 판정과 직업별 건수 집계. 실행 방법은 [해방 무기 통계 개발일지](../docs/devlog/2026-11-26-weapon-stats.md)를 참고한다.

운영 비밀값은 Cloudflare Secrets로만 둔다: `NEXON_API_KEY`(헥사 닉네임 검색용 사이트 넥슨 키), `FEEDBACK_ADMIN_PASSWORD`(건의 게시판 답글·삭제). 코드·문서·Git에 값을 쓰지 않는다.

- `response.ts`: 공통 JSON 응답

DB 구조와 저장 규칙은 [데이터베이스 문서](../docs/database.md)를 참고한다. API 키와 비밀번호를 로그에 기록하지 않는다.
