# 기록장 서비스

- http.ts: 요청 검증·분기와 사냥 기록 조회·저장.
- account.ts: 기록장 생성·열기·닫기.
- auth.ts: 비밀번호 해시, 세션, 쿠키.
- rate-limit.ts: DB 기반 요청 제한.
- response.ts: 캐시하지 않는 JSON 응답.
- book-credentials.ts: 기존·신규 기록장 입력 검증.
- boss-store.ts: 보스 기록 저장과 버전 충돌 처리.
- nexon.ts: 공식 API 조회 및 부분 실패 정규화.
- character-search.ts: 공개 랭킹 캐릭터 조회.

DB 연결은 db/ledger.ts, 공유 계약은 contracts에서 관리합니다. app/api/ledger/route.ts는 서비스로 위임하는 라우팅 진입점입니다.
