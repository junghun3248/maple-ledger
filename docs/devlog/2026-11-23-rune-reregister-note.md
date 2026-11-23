# 2026-11-23 재획 타이머: 룬 등록 안내 문구

작성: Claude

## 내용

- 룬 알림은 등록한 미니맵 영역을 고정해서 보므로, 사냥터마다 미니맵 크기가 다르면 다시 등록해야 합니다. 룬 알림 줄, 룬 등록 안내, 사용 안내 창에 "(사냥터가 바뀌면 새로 지정해 주세요)"를 넣었습니다.

## 파일

- `features/hunting/live/ScreenWatch.tsx`, `features/hunting/live/LiveGuide.tsx`

## DB 마이그레이션

필요 없습니다.

검증: 타입 검사, ESLint, 테스트, Cloudflare 빌드 통과. 개발 서버에서 문구를 확인했습니다.
