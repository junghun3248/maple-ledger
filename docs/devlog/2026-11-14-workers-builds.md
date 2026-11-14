# 2026-11-14 Cloudflare Workers Builds로 배포 전환

작성: Claude

GitHub Actions에서 Cloudflare API 토큰으로 배포하던 방식을 Cloudflare Workers Builds(저장소 직접 연결)로 바꿨습니다. main에 병합되면 Cloudflare가 `npm run build:cloudflare` → `npm run deploy:cloudflare`를 실행합니다. GitHub Actions에는 PR 검사(타입 검사·테스트)만 남겼고, `AGENTS.md`와 배포 문서를 갱신했습니다. GitHub에 등록한 `CLOUDFLARE_API_TOKEN` 시크릿은 더 이상 쓰지 않습니다.
