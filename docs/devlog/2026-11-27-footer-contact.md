# 2026-11-27 모든 페이지 하단 문의 연락처

작성: Claude

## 내용

- 사용자 요청으로 사이트의 모든 페이지 맨 아래에 운영자 문의 메일(`mailto:` 링크)을 넣었습니다.
- 루트 레이아웃(`app/layout.tsx`)에 공통 `SiteFooter`(`components/ledger/SiteFooter.tsx`)를 두어서, 새 페이지에도 자동으로 붙습니다.
- 스타일은 `components/ledger/theme.css`의 `.site-footer`입니다. 가운데 정렬·흐린 글자색이고, 라이트·다크 테마 변수를 씁니다.

## DB 마이그레이션

필요 없습니다.

## 검증

- 타입 검사, ESLint, Prettier, 테스트, Cloudflare 빌드를 통과했습니다.
- 개발 서버에서 홈·사냥·보스·수입·헥사·스타포스·피드백 페이지 모두 하단에 메일 링크가 있는 것을 확인했습니다.
