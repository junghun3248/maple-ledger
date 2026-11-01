# 아키텍처

- app: 페이지와 HTTP 진입점. 서버 로직이나 DOM 제어를 집중시키지 않는다.
- features/boss: 보스 구성·물욕템·캐릭터·스케줄러·정산 상태.
- features/hunting: 사냥 입력·사진 판독·캘린더·기록 동기화.
- contracts: 공유 스키마와 타입. 보스 상태 타입은 Zod 스키마에서 파생한다.
- server/ledger: 인증·계정·요청 제한·저장·외부 API.
- db: D1 연결, Drizzle 선언, 행 타입. 테이블과 JSON 형식은 기존과 호환된다.
- lib/ledger: 날짜·금액 포맷, API 호출, 백업 다운로드.

Next.js App Router를 주 규약으로 사용하며 기존 Vinext/Vite는 Cloudflare 빌드 계층으로 유지한다. 별도 React 앱이나 두 번째 라우터를 만들지 않는다. 화면 CSS는 기능 루트에 한정한다.

페이지 간 이동은 일반 링크를 사용해 저장 전 beforeunload 경고를 유지한다. 현재 Vinext의 RSC 링크 미리읽기 오류도 피한다. API 키와 인증 해시는 클라이언트 응답에 포함하지 않는다.

기존 shadcn 레지스트리 및 connector 보조 코드는 보존했다. Base UI와 Radix는 각각 실제 참조되는 컴포넌트가 있어 패키지 이름만 보고 삭제하지 않는다. 새 화면은 별도 UI 라이브러리를 추가하지 않는다.
