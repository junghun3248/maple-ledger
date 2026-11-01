# 라우팅

- `page.tsx`: 사냥 가계부
- `boss/page.tsx`: 보스 정산
- `layout.tsx`: 공통 문서 레이아웃
- `api/ledger/route.ts`: 기록장·넥슨 API 진입점

페이지는 `features/`를 연결하며 API 로직은 `server/ledger/`에 둔다. `public/`의 HTML이나 DOM 제어 스크립트가 페이지를 대신하지 않는다.
