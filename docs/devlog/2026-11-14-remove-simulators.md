# 2026-11-14 시뮬레이터 코드 삭제

작성: Claude

2026-11-06에 메뉴에서 빼고 보존하던 강화·캐시 뽑기 시뮬레이터를 사용자 요청으로 완전히 삭제했습니다.

- 삭제: `app/simulator`(보스 정산으로 넘기던 주소 포함), `features/simulator`, `features/cash`, `server/simulator`, `contracts/simulator`, 관련 테스트와 `docs/simulator.md`.
- `/api/ledger`의 `simulator-probabilities`, `simulator-equipment` 요청 처리와 README 안내를 제거했습니다.
- `/simulator`, `/simulator/cash` 주소는 이제 없는 페이지로 표시됩니다. 사냥·보스·자산 기능과 DB는 바뀌지 않았습니다.

검증: 타입 검사, 남은 테스트 78개, ESLint(신규 경고 없음), Cloudflare 빌드 통과.
