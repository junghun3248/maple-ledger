# 기록장 서비스

- http.ts: 요청 분기와 인증·저장 흐름. 추가 책임 분리 중.
- auth.ts: 비밀번호 해시, 세션, 쿠키.
- rate-limit.ts: DB 기반 요청 제한.
- response.ts: 캐시하지 않는 JSON 응답.
- book-credentials.ts: 기존·신규 기록장 입력 검증.
- boss-store.ts: 보스 기록 저장과 버전 충돌 처리.
- nexon.ts: 공식 API 조회 및 부분 실패 정규화.
- character-search.ts: 공개 랭킹 캐릭터 조회.

DB 연결은 db/ledger.ts, 공유 계약은 contracts에서 관리합니다. app/api/ledger의 기존 모듈 경로는 호환 재수출로 유지합니다.
