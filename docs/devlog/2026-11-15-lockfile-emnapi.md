# 2026-11-15 배포 실패 수정 (lockfile)

작성: Claude

11-15 강화 비용 반영 후 GitHub 검사와 Cloudflare Workers Builds가 `npm ci` 단계에서 실패해 사이트에 반영되지 않았습니다.

- 원인: 미사용 패키지를 npm 11로 지울 때 `package-lock.json`에서 `@rolldown/binding-wasm32-wasi`가 쓰는 `@emnapi/core`, `@emnapi/runtime` 항목이 빠졌습니다. CI의 npm 10은 이를 lockfile 불일치로 보고 설치를 거부합니다(11-14 lockfile 정리와 같은 문제).
- 수정: 빠진 두 항목만 되살렸습니다. 직접 의존성은 바뀌지 않았습니다.
- 사용자 요청에 따라 PR 없이 검증 후 main에 바로 반영하도록 `AGENTS.md` 16장을 바꿨습니다. 의존성을 바꾸면 npm 10 `npm ci`를 확인하는 규칙도 추가했습니다.

검증: 깨끗한 폴더에서 npm 10.9·11.6 `npm ci` 성공, 수정 전 lockfile은 npm 10에서 같은 오류로 실패하는 것을 재현했습니다.
