# 라우팅

- `page.tsx`: 홈 대시보드 (이번 주·이번 달 수익, 최근 7일, 다음 목표, 최근 활동)
- `hunting/page.tsx`: 재획 타이머와 사냥 기록 (맨 위 재획 세션·화면 공유 알림, 끝내면 같은 화면의 기록 입력칸을 채움)
- `hunting/live/page.tsx`: 예전 재획 타이머 주소. `/hunting`으로 보낸다.
- `boss/page.tsx`: 보스 정산
- `income/page.tsx`: 수입 그래프와 목표
- `hexa/page.tsx`: 헥사 계산기
- `starforce/page.tsx`: 스타포스 기대 비용 계산기
- `weapon-stats/page.tsx`: 종합 랭킹 기준 해방 무기 통계 (사전 집계된 건수만 표시, 전체 수집 전까지 숨김·404)
- `feedback/page.tsx`: 건의·제보 게시판 (`api/feedback/route.ts`가 `server/feedback/http.ts`를 연결)
- `layout.tsx`: 공통 문서 레이아웃·메타데이터
- `api/ledger/route.ts`: 기록장·넥슨 API 진입점

페이지는 `features/`를 연결하며 API 로직은 `server/ledger/`에 둔다. `public/`의 HTML이나 DOM 제어 스크립트가 페이지를 대신하지 않는다.
