# 데이터베이스와 저장 규칙

## 테이블

| 테이블          | 키             | 저장 내용                                           | 접근 경로                    |
| --------------- | -------------- | --------------------------------------------------- | ---------------------------- |
| ledger_books    | id, 고유 name  | 비밀번호 검증용 salt/hash, 사냥 기록 JSON, revision | account.ts, auth.ts, http.ts |
| ledger_sessions | token 해시     | 기록장 id, 만료 시각                                | auth.ts, account.ts          |
| ledger_limits   | 요청 구간 해시 | 횟수, 만료 시각                                     | rate-limit.ts                |
| boss_plans      | book           | 캐릭터·보스·드롭·프리셋 JSON, revision              | boss-store.ts                |

Drizzle 선언은 `db/schema.ts`, 실행 환경의 D1 연결은 `db/ledger.ts`, 행 타입은 `db/ledger-types.ts`에 있다. 실제 DB 작업은 `server/ledger/`가 담당하며 클라이언트가 직접 접근하지 않는다.

## 저장과 동기화

- 기록장 이름은 NFKC 정규화·공백 제거·소문자화 후 조회한다.
- 비밀번호는 PBKDF2-SHA256으로 검증하고, 원문을 DB에 저장하지 않는다.
- 로그인 쿠키는 HttpOnly, SameSite=Strict이며 HTTPS에서는 Secure를 사용한다.
- 사냥과 보스의 revision은 별개다. UPDATE 조건에 기존 revision을 포함한다.
- 다른 기기에서 먼저 저장했다면 409를 반환한다. 최신 기록을 읽기 전 덮어쓰지 않는다.
- 보스 JSON은 기록장 하나의 정산 상태를 원자적으로 저장한다. 사냥 JSON도 기존 API 계약을 유지한다.
- JSON을 별도 테이블로 분해하는 변경은 하지 않았다. 이는 데이터 이동과 API 변경을 동반하므로 이번 동작 보존 리팩토링과 분리한다.
- 넥슨 API 키·스크린샷은 DB와 백업에 포함되지 않는다. 키는 사용자의 해당 브라우저에서만 재사용한다.

## 마이그레이션

`drizzle/0000_fine_shiva.sql`이 기록장·세션·요청 제한을, `0001_nosy_steve_rogers.sql`이 보스 정산 테이블을 만든다. 기존 SQL의 의미와 순서를 바꾸지 않는다. 이번 구조 변경에는 운영 DB 마이그레이션이 필요 없다.

신규 환경은 두 마이그레이션을 순서대로 적용한다. 기존 환경에는 적용 이력을 확인하고 미적용분만 적용한다. DB 초기화·테이블 삭제·사용자 기록 삭제는 배포 과정에 포함하지 않는다.

## 점검

`npm test`는 계약·수익·스케줄러·OCR 회귀를 검사한다. 로컬 미리보기를 실행한 뒤 `LEDGER_TEST_URL`을 로컬 주소로 설정하고 `node tests/http-ledger.integration.mjs`를 실행하면 두 세션의 저장·충돌·로그아웃을 검사한다. 이 검사는 로컬 DB에 테스트 기록장을 추가하며 운영 주소를 거부한다.
