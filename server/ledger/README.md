# 기록장 서비스

- http.ts: 기존 HTTP 동작을 보존한 서비스 진입점. 인증·저장 분리는 후속 단계입니다.
- book-credentials.ts: 기존·신규 기록장 입력 검증.
- boss-store.ts: 보스 기록 저장과 버전 충돌 처리.
- nexon.ts: 공식 API 조회 및 부분 실패 정규화.
- character-search.ts: 공개 랭킹 캐릭터 조회.

app/api/ledger의 기존 모듈 경로는 호환 재수출로 유지합니다.
