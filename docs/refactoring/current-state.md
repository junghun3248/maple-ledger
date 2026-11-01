# 현재 구조

`/`와 `/boss`는 Next.js App Router의 React 페이지다. app은 진입점, features는 화면·상태·순수 계산, contracts는 검증·공유 타입, server는 계정·저장·외부 API, db는 D1 연결·Drizzle 선언을 담당한다.

기존 public HTML과 DOM 제어 스크립트는 제거했다. public에는 보스·아이템 이미지, 가격·드롭 데이터와 OCR 템플릿만 남는다. OCR 판독 엔진은 features/hunting/ocr의 ES 모듈로 지연 로드한다.

Vinext/Vite는 Next.js 규약을 Cloudflare Workers용으로 빌드한다. 빌드 경로와 기존 D1 데이터 형식은 유지한다. DB 초기화나 기록 삭제는 수행하지 않는다.

기록장은 서버 D1에 저장하고, 넥슨 키는 사용자가 연결한 브라우저에서 재사용한다. 키는 DB·백업·공개 코드에 포함하지 않는다.

공통 금액·날짜 포맷은 lib/ledger, 공통 기록장 모달·내비게이션은 components/ledger에 있다. [DB 상세](../database.md)를 참고한다.
