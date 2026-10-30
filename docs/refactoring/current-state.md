# 현재 구조

현재 /와 /boss는 app의 Route Handler가 public의 HTML을 반환한다. Next.js React 페이지로 구현된 상태가 아니다. 브라우저 로직은 public/app.js 및 boss*.js에 있고, API와 서버 서비스는 app/api/ledger에 모여 있다.

Vinext/Vite는 Next.js 규약의 라우팅을 Cloudflare Workers용으로 빌드한다. D1에 기록장과 세션, 보스 기록을 저장한다. db에는 Drizzle 연결 및 스키마가 있고 drizzle에는 마이그레이션이 있다.

진행 중인 다중 캐릭터 선택·전투력 필터 변경은 자동 테스트 23개와 빌드를 통과했다. 실제 API 브라우저 검증 및 운영 배포는 아직 완료되지 않았다. 리팩토링 원본에 함께 보존한다.

서버 저장과 브라우저 API 키 재사용은 별개다. 사용자 키는 사용자 요청에 따라 브라우저에만 저장하며 서버 DB나 코드에 보관하지 않는다.
