# 2026-11-14 Codex·Claude 공동 작업 규칙과 자동 배포

작성: Claude

Codex와 Claude가 같은 저장소에서 작업할 수 있도록 규칙과 배포 경로를 통일했습니다. 사이트 코드와 동작은 변경하지 않았습니다.

## 변경

- `CLAUDE.md`를 추가했습니다. `AGENTS.md`를 불러오기만 하므로 규칙은 한 곳에서 관리합니다.
- `AGENTS.md`에 16장 공동 작업 규칙을 추가했습니다. 에이전트별 브랜치와 PR 병합, 커밋·개발일지 형식, 배포와 마이그레이션 순서를 정했습니다.
- `.github/workflows/deploy-cloudflare.yml`을 추가했습니다. PR마다 타입 검사와 테스트를 실행하고, main 병합 시 `build:cloudflare` → `deploy:cloudflare`로 배포합니다. Cloudflare 시크릿이 없으면 배포 단계는 건너뜁니다.
- D1 마이그레이션은 자동 적용하지 않습니다. 기존처럼 백업 후 수동으로 적용합니다.

## 검증

- 깨끗한 클론에서 `npm install`, `npm run typecheck` 통과.
- `npm test` 80개 통과.
- `npm run build:cloudflare` 통과, `dist/server/wrangler.json` 생성 확인.
- 워크플로 자체는 GitHub에서 첫 실행 시 확인합니다.
